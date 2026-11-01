import { isIP } from "node:net";
import type { NetworkPolicy } from "@upstash/box";

export const DEFAULT_SANDBOX_ALLOWED_DOMAINS = [
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "pypi.org",
  "files.pythonhosted.org",
  "proxy.golang.org",
  "sum.golang.org",
  "crates.io",
  "index.crates.io",
  "static.crates.io",
  "rubygems.org",
  "github.com",
  "codeload.github.com",
  "objects.githubusercontent.com",
  "raw.githubusercontent.com",
  "gitlab.com",
] as const;

export const SANDBOX_NETWORK_POLICY_DESCRIPTION =
  "egress limited to package registries and git hosts";

const hostnamePattern =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;

function normalizeHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase();
  if (
    normalized.length > 253 ||
    isIP(normalized) !== 0 ||
    /^\d+(?:\.\d+){3}$/.test(normalized) ||
    !hostnamePattern.test(normalized)
  ) {
    throw new Error(`Invalid sandbox allowlist hostname: ${hostname}`);
  }
  return normalized;
}

export function buildSandboxNetworkPolicy(extraDomains: string[]): NetworkPolicy {
  const allowedDomains = [
    ...new Set([...DEFAULT_SANDBOX_ALLOWED_DOMAINS, ...extraDomains.map(normalizeHostname)]),
  ];
  return { mode: "custom", allowedDomains };
}
