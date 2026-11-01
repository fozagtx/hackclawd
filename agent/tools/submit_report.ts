import { defineTool } from "eve/tools";
import { z } from "zod";
import { type Config, config } from "../../src/config.js";
import { createReportStore } from "../../src/reports/store.js";

const inputSchema = z.object({
  program: z.string().trim().min(1),
  markdown: z.string().min(1),
  findings: z.array(
    z.object({
      title: z.string().trim().min(1),
      severity: z.string().trim().min(1),
      status: z.enum(["candidate", "poc-passed"]).default("candidate"),
    }),
  ),
});

type ReportStore = ReturnType<typeof createReportStore>;

export function createSubmitReportTool(
  config: Config,
  store: ReportStore = createReportStore(config.dataDir),
) {
  return defineTool({
    description: "Save the authorized security assessment and its findings for human review.",
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
