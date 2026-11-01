import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { createBoxRunner } from "../src/sandbox/box-runner.js";

describe.skipIf(!config.upstashBoxApiKey)("Upstash Box integration", () => {
  it("runs a Node command in a real box", async () => {
    const result = await createBoxRunner(config).run({
      commands: ['node -e "console.log(1+1)"'],
      runtime: "node",
    });

    expect(result.results[0]?.stdout.trim()).toBe("2");
    expect(result.results[0]?.exitCode).toBe(0);
  }, 120_000);
});
