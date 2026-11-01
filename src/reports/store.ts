import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const findingInputSchema = z
  .object({
    title: z.string().trim().min(1),
    severity: z.string().trim().min(1),
    status: z.enum(["candidate", "poc-passed"]).default("candidate"),
    pocCommand: z.string().trim().min(1).optional(),
    pocOutput: z.string().trim().min(1).optional(),
  })
  .superRefine((finding, ctx) => {
    if (finding.status !== "poc-passed") return;
    if (!finding.pocCommand) {
      ctx.addIssue({
        code: "custom",
        path: ["pocCommand"],
        message: "A poc-passed finding must quote the sandbox command that proved it.",
      });
    }
    if (!finding.pocOutput) {
      ctx.addIssue({
        code: "custom",
        path: ["pocOutput"],
        message: "A poc-passed finding must quote the sandbox output that proved it.",
      });
    }
  });

const reportInputSchema = z.object({
  sessionAddress: z.string().min(1),
  program: z.string().trim().min(1),
  markdown: z.string(),
  findings: z.array(findingInputSchema),
});

const reportSchema = z.object({
  id: z.uuid(),
  sessionAddress: z.string(),
  program: z.string(),
  markdown: z.string(),
  findings: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      severity: z.string(),
      status: z.enum(["candidate", "poc-passed", "confirmed"]),
      pocCommand: z.string().optional(),
      pocOutput: z.string().optional(),
    }),
  ),
  createdAt: z.string().datetime(),
});

export type FindingStatus = "candidate" | "poc-passed" | "confirmed";
export type Report = z.infer<typeof reportSchema>;
export type CreateReportInput = z.input<typeof reportInputSchema>;

export class ReportStoreError extends Error {
  constructor(
    readonly code: "report_not_found" | "finding_not_found" | "finding_already_confirmed",
  ) {
    super(code);
    this.name = "ReportStoreError";
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function createReportStore(dataDir: string) {
  const reportsDir = join(dataDir, "reports");

  async function atomicWrite(report: Report): Promise<void> {
    await mkdir(reportsDir, { recursive: true });
    const destination = join(reportsDir, `${report.id}.json`);
    const temporary = join(reportsDir, `.${report.id}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async function get(id: string): Promise<Report | null> {
    if (!z.uuid().safeParse(id).success) return null;
    try {
      const report = reportSchema.parse(
        JSON.parse(await readFile(join(reportsDir, `${id}.json`), "utf8")),
      );
      return report;
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async function create(input: CreateReportInput): Promise<Report> {
    const parsed = reportInputSchema.parse(input);
    const report = reportSchema.parse({
      id: randomUUID(),
      sessionAddress: parsed.sessionAddress,
      program: parsed.program,
      markdown: parsed.markdown,
      findings: parsed.findings.map((finding) => ({
        id: randomUUID(),
        ...finding,
      })),
      createdAt: new Date().toISOString(),
    });
    await atomicWrite(report);
    return report;
  }

  async function list(): Promise<Report[]> {
    let filenames: string[];
    try {
      filenames = await readdir(reportsDir);
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
    const reports = await Promise.all(
      filenames
        .filter((filename) => filename.endsWith(".json"))
        .map((filename) => get(filename.slice(0, -5))),
    );
    return reports
      .filter((report): report is Report => report !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async function confirmFinding(reportId: string, findingId: string): Promise<Report> {
    const report = await get(reportId);
    if (!report) throw new ReportStoreError("report_not_found");
    const finding = report.findings.find((entry) => entry.id === findingId);
    if (!finding) throw new ReportStoreError("finding_not_found");
    if (finding.status === "confirmed") {
      throw new ReportStoreError("finding_already_confirmed");
    }
    finding.status = "confirmed";
    await atomicWrite(report);
    return report;
  }

  return { create, get, list, confirmFinding };
}
