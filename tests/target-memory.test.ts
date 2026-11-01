import { describe, expect, it } from "vitest";
import { followUpPrompt, TargetMemory } from "../src/switch/target-memory.js";

describe("TargetMemory", () => {
  it("remembers the last target per address", () => {
    const memory = new TargetMemory();
    memory.remember("room-1", "theredguild/damn-vulnerable-defi");
    memory.remember("room-2", "juice-shop/juice-shop");
    expect(memory.get("room-1")).toBe("theredguild/damn-vulnerable-defi");
    expect(memory.get("room-2")).toBe("juice-shop/juice-shop");
  });

  it("returns null for an address with no audit yet", () => {
    expect(new TargetMemory().get("room-1")).toBeNull();
  });

  it("replaces the target when a new program is audited", () => {
    const memory = new TargetMemory();
    memory.remember("room-1", "owner/first");
    memory.remember("room-1", "owner/second");
    expect(memory.get("room-1")).toBe("owner/second");
  });

  it("round-trips through restore for persistence across a restart", () => {
    const memory = new TargetMemory();
    memory.remember("room-1", "owner/repo");
    const restored = TargetMemory.restore(memory.all());
    expect(restored.get("room-1")).toBe("owner/repo");
  });

  it("ignores blank entries when restoring", () => {
    const restored = TargetMemory.restore({ "room-1": "  ", "room-2": "owner/repo" });
    expect(restored.get("room-1")).toBeNull();
    expect(restored.get("room-2")).toBe("owner/repo");
  });
});

describe("followUpPrompt", () => {
  it("keeps the message unchanged when nothing was audited before", () => {
    expect(followUpPrompt(null, "audit owner/repo")).toBe("audit owner/repo");
  });

  it("names the remembered program so the agent does not ask for the repo again", () => {
    const prompt = followUpPrompt("theredguild/damn-vulnerable-defi", "find a critical there");
    expect(prompt).toContain("theredguild/damn-vulnerable-defi");
    expect(prompt).toContain("find a critical there");
    expect(prompt).toMatch(/instead of asking for the code again/i);
  });
});
