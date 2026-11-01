import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareWorkflowStorage } from "../src/persistence.js";

describe("workflow storage", () => {
  let appDir: string;

  afterEach(async () => {
    await rm(appDir, { recursive: true, force: true });
  });

  it("links eve workflow data into the configured persistent data directory", async () => {
    appDir = await mkdtemp(join(tmpdir(), "hackclawd-storage-"));
    const dataDir = join(appDir, "persistent");

    await prepareWorkflowStorage(dataDir, appDir);

    const linkPath = join(appDir, ".eve", ".workflow-data");
    const targetPath = join(dataDir, ".eve", ".workflow-data");
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(await realpath(linkPath)).toBe(await realpath(targetPath));
  });

  it("preserves existing eve data when moving it onto persistent storage", async () => {
    appDir = await mkdtemp(join(tmpdir(), "hackclawd-storage-"));
    const dataDir = join(appDir, "persistent");
    const oldWorld = join(appDir, ".eve", ".workflow-data");
    await mkdir(oldWorld, { recursive: true });
    await writeFile(join(oldWorld, "workflow.db"), "existing state");

    await prepareWorkflowStorage(dataDir, appDir);

    expect(await readFile(join(dataDir, ".eve", ".workflow-data", "workflow.db"), "utf8")).toBe(
      "existing state",
    );
    expect((await lstat(oldWorld)).isSymbolicLink()).toBe(true);
  });
});
