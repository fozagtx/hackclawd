import { describe, expect, it } from "vitest";
import { parseEnv, upsertEnv } from "../src/local/env-file.js";

describe("env file helpers", () => {
  it("parses keys, skipping comments and blank lines", () => {
    expect(parseEnv("# note\nA=1\n\nB = two=2\nEMPTY=\n")).toEqual({
      A: "1",
      B: "two=2",
      EMPTY: "",
    });
  });

  it("replaces existing keys in place and appends new ones", () => {
    expect(upsertEnv("# keep\nA=old\nB=2\n", { A: "new", C: "3" })).toBe(
      "# keep\nA=new\nB=2\nC=3\n",
    );
  });

  it("rejects values that would break the file", () => {
    expect(() => upsertEnv("", { A: "x\ny" })).toThrow("A");
  });
});
