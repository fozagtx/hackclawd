/**
 * The last program audited in a channel. A follow-up like "find a critical there" names no
 * repository, so without this the agent has to ask the human to paste the target again.
 */
export class TargetMemory {
  readonly #targets = new Map<string, string>();

  remember(address: string, target: string): void {
    this.#targets.set(address, target);
  }

  get(address: string): string | null {
    return this.#targets.get(address) ?? null;
  }

  all(): Record<string, string> {
    return Object.fromEntries(this.#targets);
  }

  static restore(entries: Record<string, string>): TargetMemory {
    const memory = new TargetMemory();
    for (const [address, target] of Object.entries(entries)) {
      if (typeof target === "string" && target.trim().length > 0) {
        memory.#targets.set(address, target);
      }
    }
    return memory;
  }
}

/**
 * Resolve a follow-up that refers to an earlier audit without naming it, so the agent
 * continues on that program instead of asking for the repository again.
 */
export function followUpPrompt(remembered: string | null, body: string): string {
  if (!remembered) return body;
  return [
    `Context: the last program you audited in this channel was ${remembered}.`,
    `If this message refers to it indirectly ("it", "there", "that repo") without naming a repository,`,
    `it means ${remembered}. Continue on that program instead of asking for the code again.`,
    "",
    body,
  ].join("\n");
}
