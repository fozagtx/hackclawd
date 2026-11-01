import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { parseEnv, upsertEnv } from "../src/local/env-file.js";
import { SwitchGatewayClient } from "../src/switch/gateway.js";
import { registerSwitchAgent, SwitchRegistrationConflictError } from "../src/switch/register.js";

const SWITCH_VERSION = "0.31.0";
const SWITCH_URL = "http://localhost:8000";
const composeFile = "local/switch/docker-compose.yml";
const switchEnvFile = "local/switch/.env";
const appEnvFile = ".env";

const secret = (bytes = 24) => randomBytes(bytes).toString("hex");

async function readText(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
}

async function writePrivate(path: string, text: string): Promise<void> {
  await writeFile(path, text, { mode: 0o600 });
  await chmod(path, 0o600);
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(" ")} exited with ${code}.`)),
    );
  });
}

async function switchEnv(): Promise<Record<string, string>> {
  const existing = await readText(switchEnvFile);
  if (existing) return parseEnv(existing);
  const values = {
    SWITCH_VERSION,
    API_HOST_PORT: "8000",
    POSTGRES_HOST_PORT: "55432",
    SWITCH_BIND_ADDR: "127.0.0.1",
    DB_USER: "switch_app",
    DB_PASSWORD: secret(),
    DB_OWNER_USER: "postgres",
    DB_OWNER_PASSWORD: secret(),
    DB_NAME: "switch",
    AGENT_REGISTRATION_TOKEN: secret(),
    SECRET_KEYS: `k1:${secret(32)}`,
    GATEWAY_ADMIN_EMAIL: "admin@switch.local",
    GATEWAY_ADMIN_PASSWORD: secret(),
    FRONTEND_BASE_URL: "http://localhost:3000",
    OUTBOUND_ALLOWED_PRIVATE_HOSTS: "localhost",
    MATTERMOST_USER: "",
    MATTERMOST_USER_PASSWORD: "",
    MATTERMOST_ADMIN_USER: "",
    MATTERMOST_ADMIN_PASSWORD: "",
    MATTERMOST_TEAM_NAME: "",
  };
  await writePrivate(switchEnvFile, upsertEnv("", values));
  console.log(`Created ${switchEnvFile} with fresh Switch secrets.`);
  return values;
}

async function waitForSwitch(): Promise<void> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const healthy = await fetch(`${SWITCH_URL}/health`)
      .then((response) => response.ok)
      .catch(() => false);
    if (healthy) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Switch did not become healthy at ${SWITCH_URL}/health within 3 minutes.`);
}

async function main(): Promise<void> {
  await run("docker", ["compose", "version"]).catch(() => {
    throw new Error("Docker is required. Install Docker Desktop, start it, and run this again.");
  });

  const switchValues = await switchEnv();
  console.log("Starting the local Switch server (first run downloads the images)...");
  await run("docker", [
    "compose",
    "-p",
    "hackclawd-switch",
    "-f",
    composeFile,
    "--env-file",
    switchEnvFile,
    "up",
    "-d",
  ]);
  await waitForSwitch();
  console.log(`Switch is healthy at ${SWITCH_URL}.`);

  let appText = (await readText(appEnvFile)) ?? (await readFile(".env.example", "utf8"));
  const app = { ...parseEnv(appText), ...pickSet(process.env) };
  const updates: Record<string, string> = {};

  if (!app.NEBIUS_API_KEY) {
    await writePrivate(appEnvFile, appText);
    throw new Error(
      "Add NEBIUS_API_KEY=... to .env (from tokenfactory.nebius.com), then run this again.",
    );
  }
  if (!app.HACKCLAWD_API_KEY) updates.HACKCLAWD_API_KEY = secret(32);
  if (app.SWITCH_URL !== SWITCH_URL || !app.SWITCH_AGENT_ID || !app.SWITCH_AGENT_API_KEY) {
    const registrationKey = switchValues.AGENT_REGISTRATION_TOKEN ?? "";
    const registered = await registerSwitchAgent({ baseUrl: SWITCH_URL, registrationKey }).catch(
      (error: unknown) => {
        if (!(error instanceof SwitchRegistrationConflictError)) throw error;
        return registerSwitchAgent({ baseUrl: SWITCH_URL, registrationKey, overwrite: true });
      },
    );
    Object.assign(updates, {
      SWITCH_URL,
      SWITCH_AGENT_ID: registered.id,
      SWITCH_AGENT_API_KEY: registered.apiKey,
    });
    console.log("Registered the hackclawd agent with Switch.");
  }
  appText = upsertEnv(appText, updates);
  await writePrivate(appEnvFile, appText);
  Object.assign(process.env, updates);
  const agentId = updates.SWITCH_AGENT_ID ?? app.SWITCH_AGENT_ID ?? "";

  const gateway = new SwitchGatewayClient({ baseUrl: SWITCH_URL });
  await gateway.login(
    switchValues.GATEWAY_ADMIN_EMAIL ?? "",
    switchValues.GATEWAY_ADMIN_PASSWORD ?? "",
  );
  await gateway.openAddressing(agentId);

  const bridges = await gateway.listBridges();
  if (bridges.some((bridge) => bridge.type === "slack")) {
    console.log("Slack is already connected to Switch.");
  } else if (app.SLACK_BOT_TOKEN && app.SLACK_APP_TOKEN) {
    const slack = await gateway.connectSlack({
      botToken: app.SLACK_BOT_TOKEN,
      appToken: app.SLACK_APP_TOKEN,
    });
    console.log(`Connected Slack workspace "${slack.workspaceName}" to Switch.`);
  } else {
    console.warn(
      "Slack is not connected: add SLACK_BOT_TOKEN (xoxb-) and SLACK_APP_TOKEN (xapp-) to .env and run this again.",
    );
  }
  if (!app.UPSTASH_BOX_API_KEY) {
    console.warn("UPSTASH_BOX_API_KEY is empty in .env: audits run, but PoCs cannot execute.");
  }

  console.log("Building and starting hackclawd on http://localhost:3000 ...");
  await run("npm", ["run", "build"]);
  await run("npm", ["start"]);
}

function pickSet(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
