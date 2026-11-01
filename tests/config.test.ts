import { describe, expect, it } from "vitest";
import { parseConfig, readiness } from "../src/config.js";

describe("parseConfig", () => {
  it("uses public model defaults and accepts explicit overrides", () => {
    const config = parseConfig({
      NEBIUS_API_KEY: "model-key",
      HACKCLAWD_API_KEY: "api-key",
    });

    expect(config.nebiusBaseUrl).toBe("https://api.tokenfactory.nebius.com/v1");
    expect(config.nebiusModel).toBe("moonshotai/Kimi-K2.7-Code");
    expect(
      parseConfig({
        NEBIUS_API_KEY: "model-key",
        HACKCLAWD_API_KEY: "api-key",
        NEBIUS_BASE_URL: "https://models.example/v1",
        NEBIUS_MODEL: "custom/model",
      }),
    ).toMatchObject({
      nebiusBaseUrl: "https://models.example/v1",
      nebiusModel: "custom/model",
    });
  });

  it("rejects invalid ports and permits startup without optional secrets", () => {
    expect(() => parseConfig({ PORT: "not-a-port" })).toThrow();
    expect(() => parseConfig({ PORT: "0" })).toThrow();
    expect(() => parseConfig({})).not.toThrow();
  });

  it("treats blank values from the environment template as unset", () => {
    expect(
      parseConfig({
        NEBIUS_BASE_URL: "",
        NEBIUS_MODEL: "",
        SWITCH_URL: "",
        HACKCLAWD_DATA_DIR: "",
        RENDER_EXTERNAL_URL: "",
        WORKFLOW_LOCAL_BASE_URL: "",
        PORT: "",
        HACKCLAWD_SANDBOX_ALLOWED_DOMAINS: "",
      }),
    ).toMatchObject({
      nebiusBaseUrl: "https://api.tokenfactory.nebius.com/v1",
      nebiusModel: "moonshotai/Kimi-K2.7-Code",
      dataDir: ".data",
      port: 3000,
      sandboxAllowedDomains: [],
    });
  });

  it("parses operator-provided sandbox hostnames", () => {
    expect(
      parseConfig({
        HACKCLAWD_SANDBOX_ALLOWED_DOMAINS: " Git.Example,mirror.internal ",
      }).sandboxAllowedDomains,
    ).toEqual(["Git.Example", "mirror.internal"]);
  });

  it.each([
    "https://git.example",
    "git.example/path",
    "*.example.com",
    "*",
    "192.168.1.10",
    "2001:db8::1",
  ])("rejects invalid sandbox allowlist value %s", (value) => {
    expect(() => parseConfig({ HACKCLAWD_SANDBOX_ALLOWED_DOMAINS: value })).toThrow();
  });

  it("uses the Render public origin as eve's workflow callback base", () => {
    expect(
      parseConfig({ RENDER_EXTERNAL_URL: "https://hackclawd.example" }).workflowLocalBaseUrl,
    ).toBe("https://hackclawd.example");
    expect(
      parseConfig({
        RENDER_EXTERNAL_URL: "https://hackclawd.example",
        WORKFLOW_LOCAL_BASE_URL: "https://agent.example",
      }).workflowLocalBaseUrl,
    ).toBe("https://agent.example");
  });

  it("reports integration readiness without exposing configured values", () => {
    const config = parseConfig({
      NEBIUS_API_KEY: "do-not-report-this",
      HACKCLAWD_API_KEY: "also-secret",
      UPSTASH_BOX_API_KEY: "box-secret",
      SWITCH_URL: "https://switch.example",
      SWITCH_AGENT_ID: "agent-id",
      SWITCH_AGENT_API_KEY: "switch-secret",
    });

    const status = readiness(config);

    expect(status).toEqual({
      nebius: true,
      upstashBox: true,
      hackclawdApi: true,
      switch: true,
    });
    expect(JSON.stringify(status)).not.toContain("secret");
  });

  it("allows missing optional integrations and uses local defaults", () => {
    const config = parseConfig({});

    expect(config.dataDir).toBe(".data");
    expect(config.port).toBe(3000);
    expect(readiness(config)).toEqual({
      nebius: false,
      upstashBox: false,
      hackclawdApi: false,
      switch: false,
    });
  });
});
