import { z } from "zod";
import { buildSandboxNetworkPolicy } from "./sandbox/network-policy.js";

const defaultNebiusBaseUrl = "https://api.tokenfactory.nebius.com/v1";
const defaultNebiusModel = "moonshotai/Kimi-K2.7-Code";

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);
const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().url().optional(),
);
const optionalSecret = optionalString;
const sandboxDomainList = z.preprocess(
  (value) => {
    if (typeof value !== "string" || value.trim() === "") return [];
    return value.split(",");
  },
  z.array(z.string().transform((value) => value.trim())).superRefine((domains, context) => {
    try {
      buildSandboxNetworkPolicy(domains);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid sandbox allowlist hostname.",
      });
    }
  }),
);

const envSchema = z.object({
  NEBIUS_API_KEY: optionalSecret,
  NEBIUS_BASE_URL: optionalUrl.transform((value) => value ?? defaultNebiusBaseUrl),
  NEBIUS_MODEL: optionalString.transform((value) => value ?? defaultNebiusModel),
  UPSTASH_BOX_API_KEY: optionalSecret,
  HACKCLAWD_API_KEY: optionalSecret,
  SWITCH_URL: optionalUrl,
  SWITCH_AGENT_ID: optionalSecret,
  SWITCH_AGENT_API_KEY: optionalSecret,
  SWITCH_REGISTRATION_KEY: optionalSecret,
  HACKCLAWD_SANDBOX_ALLOWED_DOMAINS: sandboxDomainList,
  HACKCLAWD_DATA_DIR: optionalString.transform((value) => value ?? ".data"),
  RENDER_EXTERNAL_URL: optionalUrl,
  WORKFLOW_LOCAL_BASE_URL: optionalUrl,
  PORT: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().min(1).max(65_535).default(3000),
  ),
});

export type Config = {
  nebiusApiKey?: string;
  nebiusBaseUrl: string;
  nebiusModel: string;
  upstashBoxApiKey?: string;
  hackclawdApiKey?: string;
  switchUrl?: string;
  switchAgentId?: string;
  switchAgentApiKey?: string;
  switchRegistrationKey?: string;
  sandboxAllowedDomains: string[];
  dataDir: string;
  workflowLocalBaseUrl?: string;
  port: number;
};

export function parseConfig(source: Record<string, string | undefined>): Config {
  const env = envSchema.parse(source);

  return {
    nebiusApiKey: env.NEBIUS_API_KEY,
    nebiusBaseUrl: env.NEBIUS_BASE_URL.replace(/\/+$/, ""),
    nebiusModel: env.NEBIUS_MODEL,
    upstashBoxApiKey: env.UPSTASH_BOX_API_KEY,
    hackclawdApiKey: env.HACKCLAWD_API_KEY,
    switchUrl: env.SWITCH_URL?.replace(/\/+$/, ""),
    switchAgentId: env.SWITCH_AGENT_ID,
    switchAgentApiKey: env.SWITCH_AGENT_API_KEY,
    switchRegistrationKey: env.SWITCH_REGISTRATION_KEY,
    sandboxAllowedDomains: env.HACKCLAWD_SANDBOX_ALLOWED_DOMAINS,
    dataDir: env.HACKCLAWD_DATA_DIR,
    workflowLocalBaseUrl: (env.WORKFLOW_LOCAL_BASE_URL ?? env.RENDER_EXTERNAL_URL)?.replace(
      /\/+$/,
      "",
    ),
    port: env.PORT,
  };
}

export function runtimeEnvironment(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return { ...process.env, ...overrides };
}

export function readiness(config: Config) {
  return {
    nebius: Boolean(config.nebiusApiKey),
    upstashBox: Boolean(config.upstashBoxApiKey),
    hackclawdApi: Boolean(config.hackclawdApiKey),
    switch: Boolean(
      config.switchUrl &&
        config.switchAgentId &&
        config.switchAgentApiKey &&
        config.hackclawdApiKey,
    ),
  };
}

export const config = parseConfig(process.env);
