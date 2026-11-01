import { afterEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../src/config.js";
import {
  type BoxClient,
  type BoxHandle,
  BoxRunner,
  createBoxRunner,
} from "../src/sandbox/box-runner.js";
import { buildSandboxNetworkPolicy } from "../src/sandbox/network-policy.js";

function fakeBox(
  id: string,
  outputs: Array<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> = [],
): BoxHandle {
  let index = 0;
  return {
    id,
    delete: vi.fn(async () => {}),
    exec: {
      command: vi.fn(
        async () =>
          outputs[index++] ?? {
            exitCode: 0,
            stdout: "",
            stderr: "",
          },
      ),
    },
    files: {
      write: vi.fn(async () => {}),
    },
  };
}

function fakeClient(box: BoxHandle, reused = box): BoxClient {
  return {
    create: vi.fn(async () => box),
    get: vi.fn(async () => reused),
  };
}

describe("BoxRunner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a labeled box, writes files, runs commands, and deletes it", async () => {
    const box = fakeBox("box-1", [{ exitCode: 0, stdout: "2\n", stderr: "" }]);
    const client = fakeClient(box);
    const runner = new BoxRunner(client);

    const result = await runner.run({
      commands: ["node main.js"],
      files: [{ path: "main.js", content: "console.log(1 + 1)" }],
      runtime: "node",
    });

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: ["hackclawd"],
        runtime: "node",
        networkPolicy: buildSandboxNetworkPolicy([]),
      }),
    );
    expect(box.files.write).toHaveBeenCalledWith({
      path: "main.js",
      content: "console.log(1 + 1)",
    });
    expect(result).toEqual({
      boxId: null,
      results: [{ command: "node main.js", exitCode: 0, stdout: "2\n", stderr: "" }],
    });
    expect(box.delete).toHaveBeenCalledOnce();
  });

  it("stops after the first non-zero exit code", async () => {
    const box = fakeBox("box-2", [
      { exitCode: 3, stdout: "", stderr: "failed" },
      { exitCode: 0, stdout: "should not run", stderr: "" },
    ]);

    const result = await new BoxRunner(fakeClient(box)).run({
      commands: ["false", "echo later"],
    });

    expect(result.results).toHaveLength(1);
    expect(box.exec.command).toHaveBeenCalledOnce();
  });

  it("continues after a non-zero exit when requested", async () => {
    const box = fakeBox("box-3", [
      { exitCode: 2, stdout: "", stderr: "failed" },
      { exitCode: 0, stdout: "continued", stderr: "" },
    ]);

    const result = await new BoxRunner(fakeClient(box)).run({
      commands: ["false", "echo later"],
      continueOnError: true,
    });

    expect(result.results).toHaveLength(2);
  });

  it("truncates stdout and stderr independently with a marker", async () => {
    const long = "x".repeat(20_000);
    const box = fakeBox("box-4", [{ exitCode: 0, stdout: long, stderr: long }]);

    const [result] = (
      await new BoxRunner(fakeClient(box)).run({
        commands: ["echo large"],
      })
    ).results;

    expect(result.stdout.length).toBeLessThan(16_500);
    expect(result.stderr.length).toBeLessThan(16_500);
    expect(result.stdout).toContain("[truncated]");
    expect(result.stderr).toContain("[truncated]");
  });

  it("returns a reused box id without deleting the box", async () => {
    const box = fakeBox("reused");
    const client = fakeClient(box);
    const runner = new BoxRunner(client);
    const created = await runner.run({ commands: [], keepAlive: true });

    const result = await runner.run({
      commands: ["echo reusable"],
      boxId: "reused",
    });

    expect(created.boxId).toBe("reused");
    expect(client.create).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenCalledWith("reused");
    expect(result.boxId).toBe("reused");
    expect(box.delete).not.toHaveBeenCalled();
  });

  it("rejects a box id that was not created by this runner", async () => {
    const client = fakeClient(fakeBox("unexpected"));

    await expect(
      new BoxRunner(client).run({ commands: ["echo blocked"], boxId: "unmanaged" }),
    ).rejects.toThrow("Box ID is not managed by this sandbox runner.");
    expect(client.get).not.toHaveBeenCalled();
    expect(client.create).not.toHaveBeenCalled();
  });

  it("does not close a box that was not created by this runner", async () => {
    const client = fakeClient(fakeBox("unmanaged"));

    await expect(new BoxRunner(client).close("unmanaged")).rejects.toThrow(
      "Box ID is not managed by this sandbox runner.",
    );
    expect(client.get).not.toHaveBeenCalled();
  });

  it("closes a retained box created by this runner", async () => {
    const box = fakeBox("retained");
    const client = fakeClient(box);
    const runner = new BoxRunner(client);

    await runner.run({ commands: [], keepAlive: true });
    await runner.close("retained");

    expect(client.get).toHaveBeenCalledOnce();
    expect(box.delete).toHaveBeenCalledOnce();
    await expect(runner.run({ commands: [], boxId: "retained" })).rejects.toThrow(
      "Box ID is not managed by this sandbox runner.",
    );
    expect(client.get).toHaveBeenCalledOnce();
  });

  it("shares the policy-aware runner for repeated calls with one config", () => {
    const config = parseConfig({});

    expect(createBoxRunner(config)).toBe(createBoxRunner(config));
  });

  it("keeps a newly created box alive when requested", async () => {
    const box = fakeBox("persistent");

    const result = await new BoxRunner(fakeClient(box)).run({
      commands: ["echo persistent"],
      keepAlive: true,
    });

    expect(result.boxId).toBe("persistent");
    expect(box.delete).not.toHaveBeenCalled();
  });

  it("deletes a new box in finally when execution throws", async () => {
    const box = fakeBox("throws");
    vi.mocked(box.exec.command).mockRejectedValueOnce(new Error("network failed"));

    await expect(
      new BoxRunner(fakeClient(box)).run({ commands: ["echo failure"] }),
    ).rejects.toThrow("network failed");
    expect(box.delete).toHaveBeenCalledOnce();
  });

  it("surfaces a create failure without retrying without the network policy", async () => {
    const client = fakeClient(fakeBox("unused"));
    vi.mocked(client.create).mockRejectedValueOnce(new Error("network policy rejected"));

    await expect(new BoxRunner(client).run({ commands: ["echo blocked"] })).rejects.toThrow(
      "network policy rejected",
    );
    expect(client.create).toHaveBeenCalledOnce();
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ networkPolicy: buildSandboxNetworkPolicy([]) }),
    );
  });
});
