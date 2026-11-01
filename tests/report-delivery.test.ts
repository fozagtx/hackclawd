import { describe, expect, it } from "vitest";
import {
  asDeliverableReport,
  celebrationHeader,
  reportFileContent,
  reportFilename,
} from "../src/reports/delivery.js";

const finding = (
  title: string,
  severity: string,
  status: "candidate" | "poc-passed" | "confirmed",
) => ({
  id: "00000000-0000-0000-0000-000000000000",
  title,
  severity,
  status,
});

describe("celebrationHeader", () => {
  it("celebrates a proven finding with its name and uppercase severity", () => {
    const text = celebrationHeader([finding("RCE in upload handler", "critical", "poc-passed")]);
    expect(text).toContain("🎉");
    expect(text).toContain("RCE in upload handler");
    expect(text).toContain("CRITICAL");
    expect(text?.toLowerCase()).toContain("confirmed");
  });

  it("picks the highest-severity proven finding when several passed", () => {
    const text = celebrationHeader([
      finding("Open redirect", "low", "poc-passed"),
      finding("Auth bypass", "high", "poc-passed"),
    ]);
    expect(text).toContain("Auth bypass");
    expect(text).toContain("HIGH");
  });

  it("returns null when nothing has a passing PoC", () => {
    expect(celebrationHeader([finding("Maybe SQLi", "high", "candidate")])).toBeNull();
    expect(celebrationHeader([])).toBeNull();
  });
});

describe("reportFilename", () => {
  it("builds a safe .md filename from the program and id", () => {
    const name = reportFilename("Acme Corp BBP!", "abcd1234-ef56-7890-abcd-ef1234567890");
    expect(name).toMatch(/^hackclawd-acme-corp-bbp-abcd1234\.md$/);
  });
});

describe("reportFileContent", () => {
  it("returns the report markdown unchanged", () => {
    expect(reportFileContent("# Report\n\nbody")).toBe("# Report\n\nbody");
  });
});

describe("asDeliverableReport", () => {
  it("accepts a persisted report shape", () => {
    expect(
      asDeliverableReport({ id: "x", program: "Acme", markdown: "# r", findings: [] }),
    ).not.toBeNull();
  });
  it("rejects sandbox tool output and non-objects", () => {
    expect(asDeliverableReport({ boxId: null, results: [] })).toBeNull();
    expect(asDeliverableReport(null)).toBeNull();
    expect(asDeliverableReport("nope")).toBeNull();
  });
});
