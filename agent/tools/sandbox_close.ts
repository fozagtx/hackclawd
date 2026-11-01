import { defineTool } from "eve/tools";
import { z } from "zod";
import { type Config, config } from "../../src/config.js";
import { type BoxRunner, createBoxRunner } from "../../src/sandbox/box-runner.js";

export function createSandboxCloseTool(
  config: Config,
  runner: BoxRunner = createBoxRunner(config),
) {
  return defineTool({
    description: "Delete a retained Upstash Box sandbox when its work is complete.",
    inputSchema: z.object({ boxId: z.string().min(1) }),
    label: { start: () => "Close sandbox" },
    async execute({ boxId }) {
      if (!config.upstashBoxApiKey) {
        return { error: "UPSTASH_BOX_API_KEY is not configured." };
      }
      try {
        await runner.close(boxId);
        return { boxId, closed: true };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Sandbox could not be closed.",
        };
      }
    },
  });
}

export default createSandboxCloseTool(config);
