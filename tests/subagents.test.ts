import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = "agent/subagents";
const expected = [
  "ai_hunter",
  "contract_flow_hunter",
  "contract_math_hunter",
  "contract_state_hunter",
  "validator",
  "web2_hunter",
];

describe("specialist subagents", () => {
  it("declares exactly the five hunters and the validator", () => {
    expect(readdirSync(root).sort()).toEqual(expected);
  });

  for (const name of expected) {
    describe(name, () => {
      const dir = join(root, name);

      it("has a description and instructions", () => {
        expect(readFileSync(join(dir, "agent.ts"), "utf8")).toMatch(/description:/);
        expect(readFileSync(join(dir, "instructions.md"), "utf8")).toMatch(/No fabrication/);
      });

      it("re-exports the root sandbox tools, since subagents inherit nothing", () => {
        for (const tool of ["sandbox_run", "sandbox_close"]) {
          expect(readFileSync(join(dir, "tools", `${tool}.ts`), "utf8")).toContain(
            `../../../tools/${tool}.js`,
          );
        }
      });

      it("cannot submit reports; only the root agent does", () => {
        expect(existsSync(join(dir, "tools", "submit_report.ts"))).toBe(false);
      });
    });
  }
});
