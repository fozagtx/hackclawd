import type { Report } from "./store.js";

type Finding = Report["findings"][number];

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
  informational: 0,
};

function severityRank(severity: string): number {
  return SEVERITY_RANK[severity.trim().toLowerCase()] ?? 1;
}

export function celebrationHeader(findings: readonly Finding[]): string | null {
  const proven = findings.filter((finding) => finding.status === "poc-passed");
  if (proven.length === 0) return null;
  const top = proven.reduce((best, finding) =>
    severityRank(finding.severity) > severityRank(best.severity) ? finding : best,
  );
  return `🎉 ${top.title} confirmed — ${top.severity.trim().toUpperCase()}`;
}

export function reportFilename(program: string, id: string): string {
  const slug =
    program
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "report";
  return `hackclawd-${slug}-${id.slice(0, 8)}.md`;
}

export function reportFileContent(markdown: string): string {
  return markdown;
}

export type DeliverableReport = {
  id: string;
  program: string;
  markdown: string;
  findings: Finding[];
};

export function asDeliverableReport(output: unknown): DeliverableReport | null {
  if (typeof output !== "object" || output === null) return null;
  const value = output as Record<string, unknown>;
  if (
    typeof value.id !== "string" ||
    typeof value.program !== "string" ||
    typeof value.markdown !== "string" ||
    !Array.isArray(value.findings)
  ) {
    return null;
  }
  return value as unknown as DeliverableReport;
}
