import { describe, expect, it, vi } from "vitest";
import { SwitchHttpClient } from "../src/switch/http.js";

describe("Switch HTTP client", () => {
  it("posts room replies with agent authentication", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
    const http = new SwitchHttpClient({
      baseUrl: "https://switch.example",
      agentId: "agent-1",
      apiKey: "secret-key",
      connectionId: "connection-1",
      fetchImpl,
    });

    await http.postMessage("room-1", "Assessment underway");

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBeDefined();
    expect(String(url)).toBe("https://switch.example/agents/agent-1/message");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret-key");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({ room_id: "room-1", content: "Assessment underway" }));
  });

  it("retries rate-limited and server-error operations", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(Response.json({ result: { addressing: "anyone" } }));
    const sleep = vi.fn(async () => {});
    const http = new SwitchHttpClient({
      baseUrl: "https://switch.example",
      agentId: "agent-1",
      apiKey: "secret-key",
      connectionId: "connection-1",
      fetchImpl,
      sleep,
    });

    const result = await http.operation("update_agent_detail", {
      agent_id: "agent-1",
      addressing: "anyone",
    });

    expect(result).toEqual({ addressing: "anyone" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
