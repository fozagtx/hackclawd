import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSandboxCloseTool } from "../agent/tools/sandbox_close.js";
import { createSandboxRunTool } from "../agent/tools/sandbox_run.js";
import { createSubmitReportTool } from "../agent/tools/submit_report.js";
import { parseConfig } from "../src/config.js";
import { createReportStore } from "../src/reports/store.js";
import type { BoxRunner } from "../src/sandbox/box-runner.js";
import { SANDBOX_NETWORK_POLICY_DESCRIPTION } from "../src/sandbox/network-policy.js";

describe("agent tools", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "hackclawd-tools-"));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("returns a clear error when sandbox_run lacks the Box key", async () => {
    const tool = createSandboxRunTool(parseConfig({ HACKCLAWD_DATA_DIR: dataDir }));
    if (!tool.execute) throw new Error("sandbox_run tool does not expose execute.");
    const result = await tool.execute({ commands: ["node -e 'console.log(1)'"] }, {} as never);

    expect(result).toMatchObject({
      error: "UPSTASH_BOX_API_KEY is not configured.",
      networkPolicy: SANDBOX_NETWORK_POLICY_DESCRIPTION,
    });
  });

  it("describes the network restriction and returns it with sandbox results", async () => {
    const runner = {
      run: async () => ({ boxId: null, results: [] }),
    } as unknown as BoxRunner;
    const tool = createSandboxRunTool(
      parseConfig({ UPSTASH_BOX_API_KEY: "test-key", HACKCLAWD_DATA_DIR: dataDir }),
      runner,
    );
    if (!tool.execute) throw new Error("sandbox_run tool does not expose execute.");

    expect(tool.description).toContain(SANDBOX_NETWORK_POLICY_DESCRIPTION);
    const result = await tool.execute({ commands: ["echo local"] }, {} as never);

    expect(result).toMatchObject({
      boxId: null,
      results: [],
      networkPolicy: SANDBOX_NETWORK_POLICY_DESCRIPTION,
    });
  });

  it("returns a clear error when sandbox_close lacks the Box key", async () => {
    const tool = createSandboxCloseTool(parseConfig({ HACKCLAWD_DATA_DIR: dataDir }));
    if (!tool.execute) throw new Error("sandbox_close tool does not expose execute.");
    const result = await tool.execute({ boxId: "box-1" }, {} as never);

    expect(result).toMatchObject({
      error: "UPSTASH_BOX_API_KEY is not configured.",
    });
  });

  it("stores reports against the active eve session address", async () => {
    const config = parseConfig({ HACKCLAWD_DATA_DIR: dataDir });
    const store = createReportStore(dataDir);
    const tool = createSubmitReportTool(config, store);
    if (!tool.execute) throw new Error("submit_report tool does not expose execute.");
    const result = await tool.execute(
      {
        program: "Acme",
        markdown: "# Reproduction",
        findings: [
          {
            title: "IDOR",
            severity: "high",
            status: "poc-passed",
            pocCommand: "node poc.js",
            pocOutput: "leaked order 42",
          },
        ],
      },
      { session: { id: "session-1" } } as never,
    );

    const report = result as {
      id: string;
      sessionAddress: string;
      findings: Array<{ status: string }>;
    };
    expect(report.sessionAddress).toBe("session-1");
    expect(report.findings[0]?.status).toBe("poc-passed");
    await expect(store.get(report.id)).resolves.toEqual(report);
  });
});
