export type RunSnapshot = {
  target: string | null;
  startedAt: number;
  stages: string[];
  /** The message that started the run, so it can be resumed without the human re-pasting it. */
  request: string;
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

  start(address: string, target: string | null, startedAt: number, request: string): void {
    this.#runs.set(address, { target, startedAt, stages: [], request });
  }

  /** The runs still in flight, for persisting across a restart. */
  all(): Record<string, RunSnapshot> {
    return Object.fromEntries(this.#runs);
  }

  static restore(entries: Record<string, RunSnapshot>): RunRegistry {
    const registry = new RunRegistry();
    for (const [address, run] of Object.entries(entries)) {
      registry.#runs.set(address, run);
    }
    return registry;
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

export function recoveryMessage(run: RunSnapshot): string {
  const target = run.target ?? "your last request";
  const where =
    run.stages.length > 0
      ? `at ${STAGE_LABELS[run.stages[run.stages.length - 1] as string] ?? run.stages[run.stages.length - 1]}`
      : "before the first stage finished";
  return `I restarted while working on ${target}, ${where}. I still have the whole thread, so you do not need to paste it again: reply \`resume\` and I will carry on from there.`;
}

export function resumePrompt(run: RunSnapshot): string {
  const target = run.target ?? "the earlier target";
  const stage = run.stages[run.stages.length - 1] ?? "recon";
  return [
    `Your previous run on ${target} was interrupted by a restart at the "${stage}" stage.`,
    "Continue it from where you left off rather than starting over, reusing what is already in this conversation.",
    `The original request was: ${run.request}`,
  ].join(" ");
}
