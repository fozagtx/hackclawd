import { describe, expect, it, vi } from "vitest";
import { SwitchHttpClient } from "../src/switch/http.js";

describe("SwitchHttpClient.postMedia", () => {
  it("uploads a file as multipart without forcing a JSON content-type", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const client = new SwitchHttpClient({
      baseUrl: "https://switch.example/",
      agentId: "agent-1",
      apiKey: "key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.postMedia(
      "room-1",
      { filename: "report.md", mimetype: "text/markdown", data: new TextEncoder().encode("# hi") },
      "Full report attached.",
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://switch.example/agents/agent-1/rooms/room-1/media");
    expect(init.body).toBeInstanceOf(FormData);
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBeNull();
    expect(headers.get("authorization")).toBe("Bearer key");
    const form = init.body as FormData;
    expect(form.get("caption")).toBe("Full report attached.");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });
});
