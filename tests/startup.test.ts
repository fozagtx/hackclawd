import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { parseConfig } from "../src/config.js";
import { startServices } from "../src/startup.js";

class FakeChild extends EventEmitter {
  readonly kill = vi.fn((signal?: NodeJS.Signals) => {
    this.emit("exit", null, signal);
    return true;
  });
}

function waitFor(predicate: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > 1_000) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for service startup."));
      }
    }, 5);
  });
}

describe("service startup", () => {
  it("starts Switch only after eve health succeeds and stops eve when the bridge exits", async () => {
    const child = new FakeChild();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const bridgeStart = vi.fn(async () => {});
    const bridgeStop = vi.fn();
    const spawnImpl = vi.fn(() => child);
    const services = startServices(
      parseConfig({
        HACKCLAWD_API_KEY: "api-key",
        SWITCH_URL: "https://switch.example",
        SWITCH_AGENT_ID: "agent-1",
        SWITCH_AGENT_API_KEY: "switch-key",
      }),
      {
        spawnImpl,
        fetchImpl,
        sleep: async () => {},
        createBridge: () => ({ start: bridgeStart, stop: bridgeStop }),
      },
    );

    await waitFor(() => bridgeStart.mock.calls.length === 1);
    child.emit("exit", 0, null);

    await expect(services.completion).resolves.toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(bridgeStop).toHaveBeenCalledOnce();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("forwards shutdown signals and exits cleanly", async () => {
    const child = new FakeChild();
    const bridgeStart = vi.fn(() => new Promise<void>(() => {}));
    const bridgeStop = vi.fn();
    const services = startServices(
      parseConfig({
        HACKCLAWD_API_KEY: "api-key",
        SWITCH_URL: "https://switch.example",
        SWITCH_AGENT_ID: "agent-1",
        SWITCH_AGENT_API_KEY: "switch-key",
      }),
      {
        spawnImpl: () => child,
        fetchImpl: async () => Response.json({ ok: true }),
        sleep: async () => {},
        createBridge: () => ({ start: bridgeStart, stop: bridgeStop }),
      },
    );

    await waitFor(() => bridgeStart.mock.calls.length === 1);
    services.stop("SIGTERM");

    await expect(services.completion).resolves.toBe(0);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(bridgeStop).toHaveBeenCalledOnce();
  });
});
