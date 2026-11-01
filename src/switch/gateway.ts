import { z } from "zod";

const slackCheckSchema = z.object({ workspace_id: z.string().min(1), workspace_name: z.string() });
const bridgeSchema = z.object({ bridge_id: z.string().min(1), bridge_type: z.string() });

export class SwitchGatewayError extends Error {
  constructor(
    readonly status: number,
    detail?: string,
  ) {
    super(`Switch gateway request failed with HTTP ${status}${detail ? `: ${detail}` : "."}`);
    this.name = "SwitchGatewayError";
  }
}

async function detailOf(response: Response): Promise<string | undefined> {
  const text = await response.text().catch(() => "");
  try {
    const detail = (JSON.parse(text) as { detail?: unknown }).detail;
    return typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : undefined;
  } catch {
    return text || undefined;
  }
}

export class SwitchGatewayClient {
  private readonly fetchImpl: typeof fetch;
  private cookie?: string;

  constructor(private readonly options: { baseUrl: string; fetchImpl?: typeof fetch }) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async login(email: string, password: string): Promise<void> {
    const response = await this.fetchImpl(this.url("/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new SwitchGatewayError(response.status, await detailOf(response));
    const cookies = response.headers.getSetCookie?.() ?? [];
    const raw = cookies.length > 0 ? cookies : [response.headers.get("set-cookie") ?? ""];
    this.cookie = raw
      .map((value) => value.split(";")[0]?.trim())
      .filter(Boolean)
      .join("; ");
    if (!this.cookie) throw new Error("Switch gateway login returned no session cookie.");
  }

  async openAddressing(agentId: string): Promise<void> {
    await this.request(`/agents/${encodeURIComponent(agentId)}/addressing-policy`, {
      method: "PUT",
      body: JSON.stringify({ policy: null }),
    });
  }

  async listBridges(): Promise<{ id: string; type: string }[]> {
    const bridges = z
      .array(bridgeSchema)
      .parse(await this.request("/collaborations", { method: "GET" }));
    return bridges.map((bridge) => ({ id: bridge.bridge_id, type: bridge.bridge_type }));
  }

  async connectSlack(tokens: {
    botToken: string;
    appToken: string;
  }): Promise<{ id: string; workspaceName: string }> {
    const botToken = tokens.botToken.trim();
    const appToken = tokens.appToken.trim();
    const checked = slackCheckSchema.parse(
      await this.request("/collaborations/setup/slack/check", {
        method: "POST",
        body: JSON.stringify({ bot_token: botToken, app_token: appToken }),
      }),
    );
    const bridge = bridgeSchema.parse(
      await this.request("/collaborations", {
        method: "POST",
        body: JSON.stringify({
          bridge_type: "slack",
          display_name: `${checked.workspace_name} Slack`,
          connection_config: {
            bot_token: botToken,
            app_token: appToken,
            workspace_id: checked.workspace_id,
          },
          set_as_default: true,
        }),
      }),
    );
    return { id: bridge.bridge_id, workspaceName: checked.workspace_name };
  }

  private url(path: string): string {
    return new URL(`/gateway${path}`, this.options.baseUrl).toString();
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    if (!this.cookie) throw new Error("Call login before using the Switch gateway.");
    const headers = new Headers(init.headers);
    headers.set("cookie", this.cookie);
    if (init.body) headers.set("content-type", "application/json");
    const response = await this.fetchImpl(this.url(path), { ...init, headers });
    if (!response.ok) throw new SwitchGatewayError(response.status, await detailOf(response));
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }
}
