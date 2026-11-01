import { type SpawnOptions, spawn } from "node:child_process";
import type { Config } from "./config.js";
import { runtimeEnvironment } from "./config.js";
import { createSwitchBridge } from "./switch/bridge.js";
import type { SwitchClient } from "./switch/client.js";

type Child = {
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
};

type StartupOptions = {
  spawnImpl?: (command: string, args: string[], options: SpawnOptions) => Child;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  createBridge?: (config: Config) => Pick<SwitchClient, "start" | "stop">;
  healthTimeoutMs?: number;
  healthPollMs?: number;
};

type Services = {
  completion: Promise<number>;
  stop(signal?: NodeJS.Signals): void;
};

function switchRequested(config: Config): boolean {
  return Boolean(config.switchUrl || config.switchAgentId || config.switchAgentApiKey);
}

export function startServices(config: Config, options: StartupOptions = {}): Services {
  const hasSwitchConfig = Boolean(
    config.switchUrl && config.switchAgentId && config.switchAgentApiKey,
  );
  if (switchRequested(config) && (!hasSwitchConfig || !config.hackclawdApiKey)) {
    throw new Error(
      "Switch startup requires SWITCH_URL, SWITCH_AGENT_ID, SWITCH_AGENT_API_KEY, and HACKCLAWD_API_KEY.",
    );
  }

  const spawnImpl =
    options.spawnImpl ?? ((command, args, spawnOptions) => spawn(command, args, spawnOptions));
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep =
    options.sleep ??
    ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const eve = spawnImpl("node_modules/.bin/eve", ["start", "--host", "0.0.0.0"], {
    stdio: "inherit",
    env: runtimeEnvironment({
      PORT: String(config.port),
      ...(config.workflowLocalBaseUrl
        ? { WORKFLOW_LOCAL_BASE_URL: config.workflowLocalBaseUrl }
        : {}),
    }),
  });

  let bridge: Pick<SwitchClient, "start" | "stop"> | undefined;
  let finished = false;
  let resolveCompletion!: (code: number) => void;
  let resolveChildExit!: () => void;
  const completion = new Promise<number>((resolve) => {
    resolveCompletion = resolve;
  });
  const childExit = new Promise<void>((resolve) => {
    resolveChildExit = resolve;
  });

  const finish = (code: number, terminateEve = false, signal: NodeJS.Signals = "SIGTERM") => {
    if (finished) return;
    finished = true;
    bridge?.stop();
    resolveCompletion(code);
    if (terminateEve) eve.kill(signal);
  };

  eve.once("exit", (code) => {
    resolveChildExit();
    finish(code === 0 ? 1 : (code ?? 1));
  });
  eve.once("error", () => {
    resolveChildExit();
    finish(1);
  });

  if (hasSwitchConfig) {
    void (async () => {
      const healthy = await waitForHealth({
        port: config.port,
        fetchImpl,
        sleep,
        childExit,
        timeoutMs: options.healthTimeoutMs ?? 60_000,
        pollMs: options.healthPollMs ?? 1_000,
      });
      if (!healthy) {
        if (!finished) finish(1, true);
        return;
      }
      if (finished) return;

      bridge = (options.createBridge ?? createSwitchBridge)(config);
      void bridge.start().then(
        () => finish(1, true),
        () => finish(1, true),
      );
    })().catch(() => finish(1, true));
  }

  return {
    completion,
    stop(signal = "SIGTERM") {
      if (finished) return;
      finished = true;
      bridge?.stop();
      resolveCompletion(0);
      eve.kill(signal);
    },
  };
}

async function waitForHealth(options: {
  port: number;
  fetchImpl: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
  childExit: Promise<void>;
  timeoutMs: number;
  pollMs: number;
}): Promise<boolean> {
  const deadline = Date.now() + options.timeoutMs;
  const url = `http://127.0.0.1:${options.port}/eve/v1/health`;

  while (Date.now() < deadline) {
    const result = await Promise.race([
      options
        .fetchImpl(url)
        .then((response) => response.ok)
        .catch(() => false),
      options.childExit.then(() => "exited" as const),
    ]);
    if (result === "exited") return false;
    if (result) return true;
    const continued = await Promise.race([
      options.sleep(options.pollMs).then(() => true),
      options.childExit.then(() => false),
    ]);
    if (!continued) return false;
  }
  return false;
}
