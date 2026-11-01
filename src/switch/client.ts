import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import WebSocket from "ws";
import { z } from "zod";
import {
  isSwitchConnectionState,
  isSwitchEvictedFrame,
  isSwitchGapFrame,
  isSwitchMessageEvent,
  isSwitchPingFrame,
  parseSwitchFrame,
  type SwitchFrame,
  type SwitchMessageEvent,
} from "./protocol.js";

const persistedStateSchema = z.object({
  connectionId: z.string().uuid(),
  generation: z.number().int().nonnegative().optional(),
  cursor: z.number().int().nonnegative().optional(),
});

type PersistedState = z.infer<typeof persistedStateSchema>;
type WebSocketConstructor = typeof WebSocket;

export type SwitchClientOptions = {
  baseUrl: string;
  agentId: string;
  apiKey: string;
  dataDir: string;
  onMessage(event: SwitchMessageEvent): Promise<void> | void;
  sleep?: (milliseconds: number) => Promise<void>;
  webSocket?: WebSocketConstructor;
};

function missingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function cursorOf(frame: SwitchFrame): number | undefined {
  if (isSwitchMessageEvent(frame)) return frame.data.sequence;
  if ("event" in frame) {
    const data = (frame as { data?: unknown }).data;
    if (
      typeof data === "object" &&
      data !== null &&
      "sequence" in data &&
      typeof data.sequence === "number"
    ) {
      return data.sequence;
    }
    const id = (frame as { id?: unknown }).id;
    return typeof id === "number" ? id : undefined;
  }
  return undefined;
}

export class SwitchClient {
  private readonly statePath: string;
  private readonly WebSocketImpl: WebSocketConstructor;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly stopSignal: Promise<void>;
  private releaseStopSignal!: () => void;
  private state?: PersistedState;
  private socket?: WebSocket;
  private running?: Promise<void>;
  private stopped = false;

  constructor(private readonly options: SwitchClientOptions) {
    this.statePath = join(options.dataDir, "switch-connection.json");
    this.WebSocketImpl = options.webSocket ?? WebSocket;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.stopSignal = new Promise((resolve) => {
      this.releaseStopSignal = resolve;
    });
  }

  start(): Promise<void> {
    if (!this.running) {
      this.stopped = false;
      this.running = this.runLoop();
    }
    return this.running;
  }

  stop(): void {
    this.stopped = true;
    this.releaseStopSignal();
    this.socket?.close(1000, "client stopped");
  }

  private async loadState(): Promise<void> {
    if (this.state) return;
    try {
      this.state = persistedStateSchema.parse(JSON.parse(await readFile(this.statePath, "utf8")));
    } catch (error) {
      if (!missingFile(error)) throw error;
      this.state = { connectionId: randomUUID() };
      await this.persistState();
    }
  }

  private async persistState(): Promise<void> {
    if (!this.state) return;
    await mkdir(dirname(this.statePath), { recursive: true });
    const temporaryPath = `${this.statePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(this.state)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      await rename(temporaryPath, this.statePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  private async runLoop(): Promise<void> {
    await this.loadState();
    let retry = 0;
    while (!this.stopped) {
      const outcome = await this.connectOnce().catch((): "reconnect" => "reconnect");
      if (this.stopped || outcome === "permanent") return;
      const exponential = Math.min(30_000, 500 * 2 ** Math.min(retry, 6));
      const delay = Math.floor(exponential * (0.75 + Math.random() * 0.5));
      retry += 1;
      await Promise.race([this.sleep(delay), this.stopSignal]);
    }
  }

  private async connectOnce(): Promise<"reconnect" | "permanent"> {
    await this.loadState();
    const state = this.state;
    if (!state) throw new Error("Switch connection state is unavailable.");
    const url = new URL(
      `/agents/${encodeURIComponent(this.options.agentId)}/connection/ws`,
      this.options.baseUrl,
    );
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("connection_id", state.connectionId);
    url.searchParams.set("scope", "all");
    url.searchParams.set("filter", "addressed");
    url.searchParams.set("start_from", state.cursor === undefined ? "head" : String(state.cursor));
    if (state.generation !== undefined) {
      url.searchParams.set("expected_generation", String(state.generation));
    }

    const socket = new this.WebSocketImpl(url, {
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
    });
    this.socket = socket;

    return new Promise((resolve) => {
      let settled = false;
      let queue = Promise.resolve();
      const finish = (outcome: "reconnect" | "permanent") => {
        if (settled) return;
        settled = true;
        if (this.socket === socket) this.socket = undefined;
        resolve(outcome);
      };

      socket.on("message", (data) => {
        let frame: SwitchFrame;
        try {
          frame = parseSwitchFrame(data as Buffer);
        } catch {
          finish("reconnect");
          socket.close();
          return;
        }

        if (isSwitchPingFrame(frame)) {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "pong", cursor: this.state?.cursor ?? 0 }));
          }
          return;
        }

        if (isSwitchConnectionState(frame)) {
          if (
            frame.connection_id !== state.connectionId ||
            frame.agent_id !== this.options.agentId
          ) {
            finish("permanent");
            socket.close();
            return;
          }
          state.generation = frame.generation;
          state.cursor = Math.max(state.cursor ?? 0, frame.cursor);
          queue = queue.then(() => this.persistState());
          return;
        }

        if (isSwitchEvictedFrame(frame)) {
          const permanent = frame.code === "taken_over";
          finish(permanent ? "permanent" : "reconnect");
          socket.close();
          return;
        }

        if (isSwitchGapFrame(frame)) {
          const newCursor = frame.cursor ?? frame.new_cursor;
          if (newCursor !== undefined) {
            state.cursor = newCursor;
            queue = queue.then(() => this.persistState());
          }
          console.warn("Switch event gap; continuing from the server cursor.");
          return;
        }

        const nextCursor = cursorOf(frame);
        queue = queue
          .then(async () => {
            if (settled) return;
            if (
              isSwitchMessageEvent(frame) &&
              frame.data.payload.addressed &&
              frame.data.payload.sender !== this.options.agentId
            ) {
              await this.options.onMessage(frame);
            }
            if (nextCursor !== undefined) {
              state.cursor = Math.max(state.cursor ?? 0, nextCursor);
              await this.persistState();
            }
          })
          .catch(() => {
            finish("reconnect");
            socket.close();
          });
      });

      socket.on("close", (code) => {
        const permanent = code === 4400 || code === 4401 || code === 4403 || code === 4409;
        finish(permanent ? "permanent" : "reconnect");
      });
      socket.on("error", () => {
        finish("reconnect");
      });
    });
  }
}
