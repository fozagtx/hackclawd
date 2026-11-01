type SwitchHttpOptions = {
  baseUrl: string;
  agentId: string;
  apiKey: string;
  connectionId?: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class SwitchHttpError extends Error {
  constructor(readonly status: number) {
    super(`Switch request failed with HTTP ${status}.`);
    this.name = "SwitchHttpError";
  }
}

export class SwitchHttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly options: SwitchHttpOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async postMessage(roomId: string, content: string): Promise<void> {
    await this.request(`/agents/${encodeURIComponent(this.options.agentId)}/message`, {
      method: "POST",
      body: JSON.stringify({ room_id: roomId, content }),
    });
  }

  async operation<T = unknown>(operation: string, args: Record<string, unknown>): Promise<T> {
    if (!this.options.connectionId) {
      throw new Error("A Switch connection ID is required for agent operations.");
    }
    const result = await this.request(
      `/agents/${encodeURIComponent(this.options.agentId)}/ops/${encodeURIComponent(operation)}`,
      {
        method: "POST",
        headers: { "x-switch-connection-id": this.options.connectionId },
        body: JSON.stringify(args),
      },
    );
    if (typeof result !== "object" || result === null || !("result" in result)) {
      throw new Error("Switch operation response is missing its result.");
    }
    return result.result as T;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.options.apiKey}`);
    headers.set("content-type", "application/json");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetchImpl(new URL(path, this.options.baseUrl).toString(), {
        ...init,
        headers,
      });
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await this.sleep(Math.min(500 * 2 ** attempt, 4_000));
        continue;
      }
      if (!response.ok) throw new SwitchHttpError(response.status);
      if (response.status === 204) return undefined;
      const text = await response.text();
      return text ? JSON.parse(text) : undefined;
    }
    throw new SwitchHttpError(503);
  }
}
