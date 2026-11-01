import { describe, expect, it } from "vitest";
import { progressUpdate } from "../src/switch/progress.js";

describe("progressUpdate", () => {
  it("reports loading the secgin skill", () => {
    expect(progressUpdate({ name: "secgin", kind: "skill" }, [])).toMatchObject({
      stage: "skill",
    });
  });

  it("treats a git clone as recon and other shell commands as hunting", () => {
    expect(
      progressUpdate(
        { name: "bash", kind: "tool", input: { command: "git clone --depth 1 https://x/y" } },
        [],
      ),
    ).toMatchObject({ stage: "recon" });
    expect(
      progressUpdate({ name: "bash", kind: "tool", input: { command: "rg login" } }, []),
    ).toMatchObject({ stage: "hunt" });
  });

  it("reports sandbox runs and report submission", () => {
    expect(progressUpdate({ name: "sandbox_run", kind: "tool" }, [])?.message).toContain(
      "Upstash Box",
    );
    expect(progressUpdate({ name: "submit_report", kind: "tool" }, [])).toMatchObject({
      stage: "report",
    });
  });

  it("posts each stage only once per turn", () => {
    expect(
      progressUpdate({ name: "bash", kind: "tool", input: { command: "ls" } }, ["hunt"]),
    ).toBeNull();
  });

  it("ignores calls that are not milestones", () => {
    expect(progressUpdate({ name: "sandbox_close", kind: "tool" }, [])).toBeNull();
  });
});
