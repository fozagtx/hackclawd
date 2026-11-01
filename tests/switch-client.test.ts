import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type WebSocket as ServerSocket, WebSocketServer } from "ws";
import { SwitchClient } from "../src/switch/client.js";

function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for Switch client state."));
      }
    }, 5);
  });
}

async function waitForCursor(path: string, cursor: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 2_000) {
    try {
      const state = JSON.parse(await readFile(path, "utf8")) as { cursor: number };
      if (state.cursor >= cursor) return;
    } catch {
      // The connection state is written when the first frame arrives.
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for persisted Switch cursor.");
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function connectionState(connectionId: string, cursor: number, generation = 7) {
  return JSON.stringify({
    type: "connection_state",
    connection_id: connectionId,
    agent_id: "agent-1",
    generation,
    scope: "all",
    filter: "addressed",
    cursor,
    heartbeat_interval_seconds: 2,
  });
}

function messageFrame(options: {
  id: number;
  addressed?: boolean;
  sender?: string;
  messageId?: string;
}) {
  return JSON.stringify({
    event: "message",
    id: options.id,
    data: {
      type: "message",
      room_id: "room-1",
      bridge_id: "bridge-1",
      channel_type: "slack",
      sequence: options.id,
      payload: {
        addressed: options.addressed ?? true,
        sender: options.sender ?? "user-1",
        sender_name: "Researcher",
        message_id: options.messageId ?? `message-${options.id}`,
        body: "Assess this program",
        timestamp: 1_700_000_000_000,
        thread_id: null,
        attachments: [],
      },
    },
  });
}

describe("SwitchClient", () => {
  let dataDir: string;
  let server: WebSocketServer;
  let baseUrl: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "hackclawd-switch-"));
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dataDir, { recursive: true, force: true });
  });

  function client(
    onMessage: (event: unknown) => Promise<void> | void,
    sleep?: (ms: number) => Promise<void>,
  ) {
    return new SwitchClient({
      baseUrl,
      agentId: "agent-1",
      apiKey: "agent-key",
      dataDir,
      onMessage,
      sleep,
    });
  }

  it("pongs immediately before a queued message finishes and advances the cursor", async () => {
    const handlerStarted = deferred();
    const handlerFinished = deferred();
    const finishHandler = deferred();
    const receivedPong = deferred();
    let pong: { type: string; cursor: number } | undefined;
    const serverConnections: ServerSocket[] = [];
    server.on("connection", (socket, request) => {
      serverConnections.push(socket);
      const connectionId =
        new URL(request.url ?? "/", baseUrl).searchParams.get("connection_id") ?? "";
      socket.send(connectionState(connectionId, 4));
      socket.send(messageFrame({ id: 5 }));
      socket.send('{"type":"ping"}');
      socket.on("message", (frame) => {
        pong = JSON.parse(frame.toString()) as typeof pong;
        receivedPong.resolve();
      });
    });
    const consumer = client(async () => {
      handlerStarted.resolve();
      await finishHandler.promise;
      handlerFinished.resolve();
    });
    const running = consumer.start();

    await Promise.all([handlerStarted.promise, receivedPong.promise]);
    expect(pong).toEqual({ type: "pong", cursor: 4 });
    finishHandler.resolve();
    await handlerFinished.promise;
    await waitForCursor(join(dataDir, "switch-connection.json"), 5);
    consumer.stop();
    await running;
    expect(serverConnections).toHaveLength(1);
    const state = JSON.parse(await readFile(join(dataDir, "switch-connection.json"), "utf8")) as {
      cursor: number;
    };
    expect(state.cursor).toBe(5);
  });

  it("subscribes to addressed events and ignores unaddressed and self-authored messages", async () => {
    const received: unknown[] = [];
    let subscription: URL | undefined;
    server.on("connection", (socket, request) => {
      subscription = new URL(request.url ?? "/", baseUrl);
      const connectionId = subscription.searchParams.get("connection_id") ?? "";
      socket.send(connectionState(connectionId, 0));
      socket.send(messageFrame({ id: 1, addressed: false }));
      socket.send(messageFrame({ id: 2, sender: "agent-1" }));
      socket.send(messageFrame({ id: 3, messageId: "accepted" }));
    });
    const consumer = client((event) => {
      received.push(event);
    });
    const running = consumer.start();

    await waitFor(() => received.length === 1);
    expect(subscription?.searchParams.get("scope")).toBe("all");
    expect(subscription?.searchParams.get("filter")).toBe("addressed");
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ data: { payload: { message_id: "accepted" } } });
    consumer.stop();
    await running;
  });

  it("resumes after 1012 using the persisted cursor and generation", async () => {
    const queries: URL[] = [];
    const delays: number[] = [];
    const messageReceived = deferred();
    server.on("connection", (socket, request) => {
      const url = new URL(request.url ?? "/", baseUrl);
      queries.push(url);
      const connectionId = url.searchParams.get("connection_id") ?? "";
      if (queries.length === 1) {
        socket.send(connectionState(connectionId, 10, 7));
        socket.send(messageFrame({ id: 11 }));
        void messageReceived.promise.then(() => socket.close(1012, "restart"));
      } else {
        socket.send(connectionState(connectionId, 11, 7));
      }
    });
    const consumer = client(
      () => messageReceived.resolve(),
      async (ms) => {
        delays.push(ms);
        await new Promise((resolve) => setTimeout(resolve, 2));
      },
    );
    const running = consumer.start();

    await waitFor(() => queries.length === 2);
    expect(queries[1]?.searchParams.get("connection_id")).toBe(
      queries[0]?.searchParams.get("connection_id"),
    );
    expect(queries[1]?.searchParams.get("start_from")).toBe("11");
    expect(queries[1]?.searchParams.get("expected_generation")).toBe("7");
    expect(delays.length).toBeGreaterThan(0);
    consumer.stop();
    await running;
  });

  it("stops permanently for bad auth and a taken-over eviction", async () => {
    for (const closeWithAuthError of [true, false]) {
      let connections = 0;
      server.on("connection", (socket, request) => {
        connections += 1;
        const connectionId =
          new URL(request.url ?? "/", baseUrl).searchParams.get("connection_id") ?? "";
        socket.send(connectionState(connectionId, 0));
        if (closeWithAuthError) socket.close(4401, "bad auth");
        else socket.send('{"type":"evicted","code":"taken_over"}');
      });
      const consumer = client(() => {});
      const running = consumer.start();
      await Promise.race([
        running,
        new Promise((_, reject) => setTimeout(() => reject(new Error("did not stop")), 1_000)),
      ]);
      expect(connections).toBe(1);
      consumer.stop();
      server.removeAllListeners("connection");
    }
  });
});
