import { describe, expect, it } from "vitest";
import {
  formatElapsed,
  RunRegistry,
  statusMessage,
  targetFromMessage,
} from "../src/switch/run-status.js";

describe("targetFromMessage", () => {
  it("picks the repository out of an audit request", () => {
    expect(
      targetFromMessage("Audit https://github.com/juice-shop/juice-shop for SQL injection."),
    ).toBe("juice-shop/juice-shop");
  });

  it("returns null when there is no repository", () => {
    expect(targetFromMessage("are you still going?")).toBeNull();
  });
});

describe("formatElapsed", () => {
  it("renders seconds, minutes and hours", () => {
    expect(formatElapsed(45_000)).toBe("45s");
    expect(formatElapsed(3 * 60_000)).toBe("3m");
    expect(formatElapsed(64 * 60_000)).toBe("1h 4m");
  });
});

describe("statusMessage", () => {
  it("says it has only just started when no stage has happened", () => {
    const text = statusMessage({ target: "a/b", startedAt: 0, stages: [] }, 20_000);
    expect(text).toContain("20s");
    expect(text).toContain("a/b");
    expect(text).not.toContain("On it. I'll post progress here as I work.");
  });

  it("names the current stage and the stages already done", () => {
    const text = statusMessage(
      { target: "a/b", startedAt: 0, stages: ["recon", "hunt", "sandbox"] },
      5 * 60_000,
    );
    expect(text).toContain("5m");
    expect(text).toContain("Upstash Box");
    expect(text).toContain("recon");
  });
});

describe("RunRegistry", () => {
  it("has no snapshot before a run starts", () => {
    expect(new RunRegistry().snapshot("room")).toBeNull();
  });

  it("tracks a run from start through stages to finish", () => {
    const runs = new RunRegistry();
    runs.start("room", "a/b", 1_000);
    runs.recordStage("room", "recon");
    expect(runs.snapshot("room")).toEqual({ target: "a/b", startedAt: 1_000, stages: ["recon"] });
    runs.finish("room");
    expect(runs.snapshot("room")).toBeNull();
  });

  it("keeps runs in different rooms apart", () => {
    const runs = new RunRegistry();
    runs.start("a", "x/y", 0);
    runs.recordStage("a", "hunt");
    expect(runs.snapshot("b")).toBeNull();
    expect(runs.snapshot("a")?.stages).toEqual(["hunt"]);
  });

  it("ignores stages for a run that is not active", () => {
    const runs = new RunRegistry();
    runs.recordStage("room", "hunt");
    expect(runs.snapshot("room")).toBeNull();
  });
});
