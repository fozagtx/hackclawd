export type RunSnapshot = {
  target: string | null;
  startedAt: number;
  stages: string[];
};

const STAGE_LABELS: Record<string, string> = {
  skill: "loading the secgin audit workflow",
  recon: "cloning the target repo",
  hunt: "reading the source for the bug",
  sandbox: "running the PoC in the Upstash Box sandbox",
  report: "writing the report with the PoC and reproduction steps",
};

const REPO_PATTERN = /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?(?=[\s/,)]|$)/i;

export function targetFromMessage(body: string): string | null {
  return REPO_PATTERN.exec(body)?.[1] ?? null;
}

export function formatElapsed(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function statusMessage(run: RunSnapshot, now: number): string {
  const elapsed = formatElapsed(now - run.startedAt);
  const target = run.target ?? "your request";
  if (run.stages.length === 0) {
    return `Still on it — ${elapsed} in on ${target}, still starting up. No stage has completed yet.`;
  }
  const current = run.stages[run.stages.length - 1] as string;
  const label = STAGE_LABELS[current] ?? current;
  const done = run.stages.slice(0, -1);
  const doneText = done.length > 0 ? ` Done so far: ${done.join(", ")}.` : "";
  return `Still working on ${target} — ${elapsed} in. Right now: ${label}.${doneText}`;
}

export class RunRegistry {
  readonly #runs = new Map<string, RunSnapshot>();

  start(address: string, target: string | null, startedAt: number): void {
    this.#runs.set(address, { target, startedAt, stages: [] });
  }

  recordStage(address: string, stage: string): void {
    const run = this.#runs.get(address);
    if (!run || run.stages.includes(stage)) return;
    run.stages.push(stage);
  }

  finish(address: string): void {
    this.#runs.delete(address);
  }

  snapshot(address: string): RunSnapshot | null {
    return this.#runs.get(address) ?? null;
  }
}
