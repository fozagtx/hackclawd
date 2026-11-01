import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RunRegistry, recoveryMessage, resumePrompt } from "../src/switch/run-status.js";
import { readRuns, writeRuns } from "../src/switch/run-store.js";

describe("run persistence", () => {
  let dataDir: string;
  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "hackclawd-runs-"));
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("returns no runs when nothing was ever written", async () => {
    await expect(readRuns(dataDir)).resolves.toEqual({});
  });

  it("round-trips the runs that were in flight", async () => {
    const runs = {
      "room-1": { target: "a/b", startedAt: 5, stages: ["recon"], request: "Audit a/b" },
    };
    await writeRuns(dataDir, runs);
    await expect(readRuns(dataDir)).resolves.toEqual(runs);
  });

  it("survives a corrupt file instead of crashing the bot", async () => {
    await writeRuns(dataDir, {
      "room-1": { target: null, startedAt: 1, stages: [], request: "x" },
    });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(dataDir, "runs.json"), "{not json");
    await expect(readRuns(dataDir)).resolves.toEqual({});
  });
});

describe("RunRegistry serialization", () => {
  it("exposes its in-flight runs and restores them", () => {
    const runs = new RunRegistry();
    runs.start("room-1", "a/b", 10, "Audit a/b please");
    runs.recordStage("room-1", "recon");

    const saved = runs.all();
    expect(saved["room-1"]).toMatchObject({
      target: "a/b",
      stages: ["recon"],
      request: "Audit a/b please",
    });

    const restored = RunRegistry.restore(saved);
    expect(restored.snapshot("room-1")).toEqual(saved["room-1"]);
  });

  it("drops a finished run from what gets persisted", () => {
    const runs = new RunRegistry();
    runs.start("room-1", null, 0, "go");
    runs.finish("room-1");
    expect(runs.all()).toEqual({});
  });
});

describe("recoveryMessage", () => {
  it("says what it was doing and that no re-paste is needed", () => {
    const text = recoveryMessage({
      target: "a/b",
      startedAt: 0,
      stages: ["recon", "hunt"],
      request: "Audit a/b",
    });
    expect(text).toContain("a/b");
    expect(text).toContain("reading the source");
    expect(text.toLowerCase()).toContain("resume");
  });
});

describe("resumePrompt", () => {
  it("replays the original request so the human never re-pastes it", () => {
    const text = resumePrompt({
      target: "a/b",
      startedAt: 0,
      stages: ["recon", "hunt"],
      request: "Audit https://github.com/a/b for SQL injection.",
    });
    expect(text).toContain("Audit https://github.com/a/b for SQL injection.");
    expect(text).toContain("hunt");
    expect(text.toLowerCase()).toContain("interrupted");
  });
});
