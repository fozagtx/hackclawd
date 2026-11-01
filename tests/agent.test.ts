import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("root agent", () => {
  it("leaves the Eve session usage cap disabled so unattended audits never pause for a human", () => {
    const source = readFileSync("agent/agent.ts", "utf8");
    expect(source).toMatch(/limits:\s*\{\s*sessionUsage:\s*false\s*\}/);
  });
});
