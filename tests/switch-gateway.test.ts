import { describe, expect, it, vi } from "vitest";
import { SwitchGatewayClient } from "../src/switch/gateway.js";

function loggedIn(fetchImpl: ReturnType<typeof vi.fn>) {
  fetchImpl.mockResolvedValueOnce(
    new Response("{}", { status: 200, headers: { "set-cookie": "switch_session=abc; Path=/" } }),
  );
}

describe("Switch gateway client", () => {
  it("logs in and sends the session cookie on later calls", async () => {
    const fetchImpl = vi.fn();
    loggedIn(fetchImpl);
    fetchImpl.mockResolvedValueOnce(Response.json({ addressing_policy: null }));
    const gateway = new SwitchGatewayClient({ baseUrl: "http://switch.local:8000", fetchImpl });

    await gateway.login("admin@switch.local", "admin-password");
    await gateway.openAddressing("agent 1");

    const [loginUrl, loginInit] = fetchImpl.mock.calls[0] ?? [];
    expect(String(loginUrl)).toBe("http://switch.local:8000/gateway/auth/login");
    expect(JSON.parse(loginInit.body)).toEqual({
      email: "admin@switch.local",
      password: "admin-password",
    });
    const [policyUrl, policyInit] = fetchImpl.mock.calls[1] ?? [];
    expect(String(policyUrl)).toBe(
      "http://switch.local:8000/gateway/agents/agent%201/addressing-policy",
    );
    expect(policyInit.method).toBe("PUT");
    expect(JSON.parse(policyInit.body)).toEqual({ policy: null });
    expect(new Headers(policyInit.headers).get("cookie")).toBe("switch_session=abc");
  });

  it("rejects a failed login with the gateway status", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 401 }));
    const gateway = new SwitchGatewayClient({ baseUrl: "http://switch.local:8000", fetchImpl });

    await expect(gateway.login("admin@switch.local", "wrong")).rejects.toThrow("HTTP 401");
  });

  it("requires login before other calls", async () => {
    const gateway = new SwitchGatewayClient({
      baseUrl: "http://switch.local:8000",
      fetchImpl: vi.fn(),
    });

    await expect(gateway.listBridges()).rejects.toThrow("login");
  });

  it("checks Slack tokens, then registers a Socket Mode bridge for that workspace", async () => {
    const fetchImpl = vi.fn();
    loggedIn(fetchImpl);
    fetchImpl
      .mockResolvedValueOnce(
        Response.json({ workspace_id: "T123", workspace_name: "Acme", bot_name: "hackclawd" }),
      )
      .mockResolvedValueOnce(Response.json({ id: "bridge-1", type: "slack" }));
    const gateway = new SwitchGatewayClient({ baseUrl: "http://switch.local:8000", fetchImpl });

    await gateway.login("admin@switch.local", "admin-password");
    const bridge = await gateway.connectSlack({ botToken: " xoxb-1 ", appToken: "xapp-1" });

    const [checkUrl, checkInit] = fetchImpl.mock.calls[1] ?? [];
    expect(String(checkUrl)).toBe(
      "http://switch.local:8000/gateway/collaborations/setup/slack/check",
    );
    expect(JSON.parse(checkInit.body)).toEqual({ bot_token: "xoxb-1", app_token: "xapp-1" });
    const [createUrl, createInit] = fetchImpl.mock.calls[2] ?? [];
    expect(String(createUrl)).toBe("http://switch.local:8000/gateway/collaborations");
    expect(JSON.parse(createInit.body)).toEqual({
      bridge_type: "slack",
      display_name: "Acme Slack",
      connection_config: { bot_token: "xoxb-1", app_token: "xapp-1", workspace_id: "T123" },
      set_as_default: true,
    });
    expect(bridge).toEqual({ id: "bridge-1", workspaceName: "Acme" });
  });

  it("surfaces Slack's rejection reason when tokens are invalid", async () => {
    const fetchImpl = vi.fn();
    loggedIn(fetchImpl);
    fetchImpl.mockResolvedValueOnce(Response.json({ detail: "invalid_auth" }, { status: 422 }));
    const gateway = new SwitchGatewayClient({ baseUrl: "http://switch.local:8000", fetchImpl });

    await gateway.login("admin@switch.local", "admin-password");
    await expect(
      gateway.connectSlack({ botToken: "xoxb-bad", appToken: "xapp-bad" }),
    ).rejects.toThrow("invalid_auth");
  });

  it("lists existing bridges by type", async () => {
    const fetchImpl = vi.fn();
    loggedIn(fetchImpl);
    fetchImpl.mockResolvedValueOnce(Response.json([{ id: "bridge-1", type: "slack" }]));
    const gateway = new SwitchGatewayClient({ baseUrl: "http://switch.local:8000", fetchImpl });

    await gateway.login("admin@switch.local", "admin-password");

    await expect(gateway.listBridges()).resolves.toEqual([{ id: "bridge-1", type: "slack" }]);
  });
});
