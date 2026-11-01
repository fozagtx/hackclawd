import { Box, type Runtime } from "@upstash/box";
import type { Config } from "../config.js";

const outputLimit = 16 * 1024;
const truncationMarker = "\n...[truncated]";

export type BoxCommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export type BoxHandle = {
  id: string;
  files: {
    write(file: { path: string; content: string }): Promise<void>;
  };
  exec: {
    command(command: string): Promise<BoxCommandResult>;
  };
  delete(): Promise<void>;
};

export type BoxClient = {
  create(options: {
    labels: string[];
    name: string;
    runtime?: Runtime;
    keepAlive?: boolean;
    timeout?: number;
  }): Promise<BoxHandle>;
  get(boxId: string): Promise<BoxHandle>;
};

export type BoxRunOptions = {
  commands: string[];
  files?: Array<{ path: string; content: string }>;
  runtime?: Runtime;
  boxId?: string;
  keepAlive?: boolean;
  timeoutMs?: number;
  continueOnError?: boolean;
};

export type BoxRunResult = {
  boxId: string | null;
  results: Array<{
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
};

function truncateStream(value: string): string {
  const bytes = Buffer.from(value);
  const maxBytes = outputLimit - Buffer.byteLength(truncationMarker);
  if (bytes.byteLength <= outputLimit) return value;
  return `${bytes.subarray(0, maxBytes).toString("utf8")}${truncationMarker}`;
}

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function withTimeout(command: string, timeoutMs?: number): string {
  if (timeoutMs === undefined) return command;
  return `timeout --signal=TERM --kill-after=2s ${Math.max(timeoutMs, 1) / 1000}s sh -c ${quoteShell(command)}`;
}

export class BoxRunner {
  constructor(private readonly client: BoxClient) {}

  async run(options: BoxRunOptions): Promise<BoxRunResult> {
    const reused = Boolean(options.boxId);
    const box = options.boxId
      ? await this.client.get(options.boxId)
      : await this.client.create({
          labels: ["hackclawd"],
          name: "hackclawd",
          runtime: options.runtime ?? "node",
          keepAlive: options.keepAlive,
          timeout: options.timeoutMs,
        });
    const keepBox = reused || Boolean(options.keepAlive);
    const results: BoxRunResult["results"] = [];

    try {
      for (const file of options.files ?? []) {
        await box.files.write(file);
      }

      for (const command of options.commands) {
        const result = await box.exec.command(withTimeout(command, options.timeoutMs));
        const exitCode = result.exitCode ?? 0;
        results.push({
          command,
          exitCode,
          stdout: truncateStream(result.stdout),
          stderr: truncateStream(result.stderr),
        });
        if (exitCode !== 0 && !options.continueOnError) break;
      }

      return { boxId: keepBox ? box.id : null, results };
    } finally {
      if (!keepBox) await box.delete();
    }
  }

  async close(boxId: string): Promise<void> {
    const box = await this.client.get(boxId);
    await box.delete();
  }
}

export function createBoxRunner(config: Config): BoxRunner {
  const client: BoxClient = {
    create: async (options) => {
      if (!config.upstashBoxApiKey) {
        throw new Error("UPSTASH_BOX_API_KEY is not configured.");
      }
      return (await Box.create({
        ...options,
        apiKey: config.upstashBoxApiKey,
        enableTelemetry: false,
      })) as BoxHandle;
    },
    get: async (boxId) => {
      if (!config.upstashBoxApiKey) {
        throw new Error("UPSTASH_BOX_API_KEY is not configured.");
      }
      return (await Box.get(boxId, {
        apiKey: config.upstashBoxApiKey,
        enableTelemetry: false,
      })) as BoxHandle;
    },
  };

  return new BoxRunner(client);
}
