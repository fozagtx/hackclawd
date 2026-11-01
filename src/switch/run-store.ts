import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunSnapshot } from "./run-status.js";

const RUNS_FILE = "runs.json";
const TARGETS_FILE = "targets.json";

export async function readRuns(dataDir: string): Promise<Record<string, RunSnapshot>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(dataDir, RUNS_FILE), "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, RunSnapshot>;
  } catch {
    return {};
  }
}

export async function writeRuns(dataDir: string, runs: Record<string, RunSnapshot>): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const destination = join(dataDir, RUNS_FILE);
  const temporary = join(dataDir, `.${RUNS_FILE}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(runs, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function readTargets(dataDir: string): Promise<Record<string, string>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(dataDir, TARGETS_FILE), "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export async function writeTargets(
  dataDir: string,
  targets: Record<string, string>,
): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const destination = join(dataDir, TARGETS_FILE);
  const temporary = join(dataDir, `.${TARGETS_FILE}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(targets, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
