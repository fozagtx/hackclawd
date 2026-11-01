import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReportStore } from "../src/reports/store.js";

describe("report store", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "hackclawd-reports-"));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("stores reports atomically with generated report and finding ids", async () => {
    const store = createReportStore(dataDir);

    const report = await store.create({
      sessionAddress: "room-1",
      program: "Acme bug bounty",
      markdown: "# Findings",
      findings: [{ title: "Broken access control", severity: "high" }],
    });

    expect(report.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(report.findings[0]?.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(report.createdAt).toBeTruthy();
    expect(await store.get(report.id)).toEqual(report);
    expect(await store.list()).toEqual([report]);
    expect(await readdir(join(dataDir, "reports"))).toEqual([`${report.id}.json`]);
    expect(
      JSON.parse(await readFile(join(dataDir, "reports", `${report.id}.json`), "utf8")),
    ).toEqual(report);
  });

  it("allows the confirmation transition only through the confirmation method", async () => {
    const store = createReportStore(dataDir);
    const report = await store.create({
      sessionAddress: "room-1",
      program: "Acme bug bounty",
      markdown: "# Candidate",
      findings: [{ title: "IDOR", severity: "medium", status: "poc-passed" }],
    });
    const findingId = report.findings[0]?.id;
    expect(findingId).toBeDefined();

    await expect(
      store.create({
        sessionAddress: "room-2",
        program: "Acme bug bounty",
        markdown: "# Invalid",
        findings: [{ title: "Forged", severity: "critical", status: "confirmed" }],
      } as never),
    ).rejects.toThrow();

    const confirmed = await store.confirmFinding(report.id, findingId);

    expect(confirmed.findings[0]?.status).toBe("confirmed");
    expect((await store.get(report.id))?.findings[0]?.status).toBe("confirmed");
  });

  it("returns no report for an unknown id", async () => {
    expect(await createReportStore(dataDir).get("missing")).toBeNull();
  });
});
