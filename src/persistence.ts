import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readdir, realpath, rename, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

function missingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export async function prepareWorkflowStorage(
  dataDir: string,
  appDir = process.cwd(),
): Promise<void> {
  const persistentWorld = resolve(appDir, dataDir, ".eve", ".workflow-data");
  const workflowPath = resolve(appDir, ".eve", ".workflow-data");
  if (persistentWorld === workflowPath) return;

  await mkdir(persistentWorld, { recursive: true });
  await mkdir(dirname(workflowPath), { recursive: true });

  let existing: Awaited<ReturnType<typeof lstat>> | undefined;
  try {
    existing = await lstat(workflowPath);
  } catch (error) {
    if (!missingPath(error)) throw error;
    await symlink(persistentWorld, workflowPath, "dir");
    return;
  }

  if (existing.isSymbolicLink()) {
    if ((await realpath(workflowPath)) !== (await realpath(persistentWorld))) {
      throw new Error("The eve workflow data path points to a different location.");
    }
    return;
  }
  if (!existing.isDirectory()) {
    throw new Error("The eve workflow data path exists and is not a directory.");
  }

  const oldEntries = await readdir(workflowPath);
  const persistentEntries = new Set(await readdir(persistentWorld));
  const conflict = oldEntries.find((entry) => persistentEntries.has(entry));
  if (conflict) {
    throw new Error(`Existing workflow data conflicts at ${conflict}; refusing to overwrite it.`);
  }
  for (const entry of oldEntries) {
    await cp(join(workflowPath, entry), join(persistentWorld, entry), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  await rename(workflowPath, `${workflowPath}.previous-${randomUUID()}`);
  await symlink(persistentWorld, workflowPath, "dir");
}
