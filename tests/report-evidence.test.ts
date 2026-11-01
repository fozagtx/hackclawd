import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReportStore } from "../src/reports/store.js";

describe("a passing PoC must carry its sandbox evidence", () => {
  let dataDir: string;
  let store: ReturnType<typeof createReportStore>;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "hackclawd-evidence-"));
    store = createReportStore(dataDir);
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  const base = { sessionAddress: "s1", program: "Acme", markdown: "# r" };

  it("rejects a poc-passed finding with no command or output", async () => {
    await expect(
      store.create({
        ...base,
        findings: [{ title: "RCE", severity: "critical", status: "poc-passed" }],
      }),
    ).rejects.toThrow();
  });

  it("rejects a poc-passed finding whose evidence is blank", async () => {
    await expect(
      store.create({
        ...base,
        findings: [
          {
            title: "RCE",
            severity: "critical",
            status: "poc-passed",
            pocCommand: "   ",
            pocOutput: "",
          },
        ],
      }),
    ).rejects.toThrow();
  });

  it("stores the quoted command and output when they are supplied", async () => {
    const report = await store.create({
      ...base,
      findings: [
        {
          title: "RCE",
          severity: "critical",
          status: "poc-passed",
          pocCommand: "forge test -vv",
          pocOutput: "[PASS] testExploit()",
        },
      ],
    });
    expect(report.findings[0]).toMatchObject({
      status: "poc-passed",
      pocCommand: "forge test -vv",
      pocOutput: "[PASS] testExploit()",
    });
  });

  it("still allows a candidate with no PoC evidence", async () => {
    const report = await store.create({
      ...base,
      findings: [{ title: "Maybe SQLi", severity: "high", status: "candidate" }],
    });
    expect(report.findings[0]?.status).toBe("candidate");
  });
});
