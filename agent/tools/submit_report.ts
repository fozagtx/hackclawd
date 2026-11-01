import { defineTool } from "eve/tools";
import { z } from "zod";
import { type Config, config } from "../../src/config.js";
import { createReportStore } from "../../src/reports/store.js";

const inputSchema = z.object({
  program: z.string().trim().min(1),
  markdown: z.string().min(1),
  findings: z.array(
    z
      .object({
        title: z.string().trim().min(1),
        severity: z.string().trim().min(1),
        status: z.enum(["candidate", "poc-passed"]).default("candidate"),
        pocCommand: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("The exact sandbox command that proved the finding. Required for poc-passed."),
        pocOutput: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("The decisive sandbox output, quoted verbatim. Required for poc-passed."),
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
      }),
  ),
});

type ReportStore = ReturnType<typeof createReportStore>;

export function createSubmitReportTool(
  config: Config,
  store: ReportStore = createReportStore(config.dataDir),
) {
  return defineTool({
    description:
      "Save the authorized security assessment and its findings for human review. A finding may only be marked poc-passed when you pass the sandbox command and its decisive output; the call is rejected otherwise.",
    inputSchema,
    label: { start: () => "Submit security report" },
    async execute(input, ctx) {
      return store.create({
        ...input,
        sessionAddress: ctx.session.id,
      });
    },
  });
}

export default createSubmitReportTool(config);
