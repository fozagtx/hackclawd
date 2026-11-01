import { defineTool } from "eve/tools";
import { z } from "zod";
import { type Config, config } from "../../src/config.js";
import { type BoxRunner, createBoxRunner } from "../../src/sandbox/box-runner.js";
import { SANDBOX_NETWORK_POLICY_DESCRIPTION } from "../../src/sandbox/network-policy.js";

const inputSchema = z.object({
  commands: z.array(z.string().min(1)).min(1),
  files: z.array(z.object({ path: z.string().min(1), content: z.string() })).optional(),
  runtime: z
    .enum([
      "node",
      "python",
      "golang",
      "ruby",
      "rust",
      "node-alpine",
      "python-alpine",
      "golang-alpine",
      "ruby-alpine",
      "rust-alpine",
    ])
    .optional(),
  boxId: z.string().min(1).optional(),
  keepAlive: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
  continueOnError: z.boolean().optional(),
});

export function createSandboxRunTool(config: Config, runner: BoxRunner = createBoxRunner(config)) {
  return defineTool({
    description: `Run proof-of-concept commands and files in an isolated Upstash Box sandbox; ${SANDBOX_NETWORK_POLICY_DESCRIPTION}, so live targets are unreachable.`,
    inputSchema,
    label: { start: () => "Run sandbox commands" },
    async execute(input) {
      if (!config.upstashBoxApiKey) {
        return {
          error: "UPSTASH_BOX_API_KEY is not configured.",
          networkPolicy: SANDBOX_NETWORK_POLICY_DESCRIPTION,
        };
      }
      try {
        return {
          ...(await runner.run(input)),
          networkPolicy: SANDBOX_NETWORK_POLICY_DESCRIPTION,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Sandbox command failed.",
          networkPolicy: SANDBOX_NETWORK_POLICY_DESCRIPTION,
        };
      }
    },
  });
}

export default createSandboxRunTool(config);
