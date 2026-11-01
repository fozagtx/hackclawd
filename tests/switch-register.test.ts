import { describe, expect, it, vi } from "vitest";
import { registerSwitchAgent, SwitchRegistrationConflictError } from "../src/switch/register.js";

describe("Switch agent registration", () => {
  it("registers the eve integration with a single request", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "agent-1", api_key: "agent-secret" }));

    const result = await registerSwitchAgent({
      baseUrl: "https://switch.example",
      registrationKey: "registration-secret",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [registrationUrl, registrationInit] = fetchImpl.mock.calls[0] ?? [];
    expect(String(registrationUrl)).toBe("https://switch.example/agents");
    expect(registrationInit?.method).toBe("POST");
    expect(new Headers(registrationInit?.headers).get("authorization")).toBe(
      "Bearer registration-secret",
    );
    expect(JSON.parse(registrationInit?.body as string)).toMatchObject({
      name: "hackclawd",
      connector_type: "eve",
      integration_profile: {
        connection_model: "always_on",
        message_exchange: true,
        pre_invocation_mediation: [],
        post_invocation_mediation: [],
        event_reporting: [],
      },
    });
    expect(result).toEqual({ id: "agent-1", apiKey: "agent-secret" });
  });

  it("explains the overwrite flag when the name already exists", async () => {
    const fetchImpl = vi.fn(async () => new Response("exists", { status: 409 }));

    await expect(
      registerSwitchAgent({
        baseUrl: "https://switch.example",
        registrationKey: "registration-secret",
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(SwitchRegistrationConflictError);
    await expect(
      registerSwitchAgent({
        baseUrl: "https://switch.example",
        registrationKey: "registration-secret",
        fetchImpl,
      }),
    ).rejects.toThrow("--overwrite");
  });
});
