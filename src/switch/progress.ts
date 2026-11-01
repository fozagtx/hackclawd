export type ProgressCall = {
  name: string;
  kind?: string;
  input?: unknown;
};

export type ProgressUpdate = {
  stage: string;
  message: string;
};

function commandOf(input: unknown): string {
  if (typeof input !== "object" || input === null || !("command" in input)) return "";
  return typeof input.command === "string" ? input.command : "";
}

function classify(call: ProgressCall): ProgressUpdate | null {
  if (call.kind === "skill") {
    return {
      stage: "skill",
      message: "Loaded the secgin audit workflow: recon, hunt, validate, report.",
    };
  }
  if (call.name === "bash") {
    if (/\bgit\s+clone\b/.test(commandOf(call.input))) {
      return { stage: "recon", message: "Recon: cloning the target repo." };
    }
    return { stage: "hunt", message: "Hunting: reading the source for the bug." };
  }
  if (call.name === "sandbox_run") {
    return {
      stage: "sandbox",
      message: "Validating: running the PoC in the Upstash Box sandbox.",
    };
  }
  if (call.name === "submit_report") {
    return {
      stage: "report",
      message: "Writing the report with the PoC and reproduction steps.",
    };
  }
  return null;
}

export function progressUpdate(
  call: ProgressCall,
  postedStages: readonly string[],
): ProgressUpdate | null {
  const update = classify(call);
  if (!update || postedStages.includes(update.stage)) return null;
  return update;
}

export const ACKNOWLEDGEMENT = "On it. I'll post progress here as I work.";
