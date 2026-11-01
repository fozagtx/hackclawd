import { describe, expect, it } from "vitest";
import {
  buildSandboxNetworkPolicy,
  DEFAULT_SANDBOX_ALLOWED_DOMAINS,
} from "../src/sandbox/network-policy.js";

describe("sandbox network policy", () => {
  it("uses the fixed package registry and git-host allowlist", () => {
    expect(buildSandboxNetworkPolicy([])).toEqual({
      mode: "custom",
      allowedDomains: [
        "registry.npmjs.org",
        "registry.yarnpkg.com",
        "pypi.org",
        "files.pythonhosted.org",
        "proxy.golang.org",
        "sum.golang.org",
        "crates.io",
        "index.crates.io",
        "static.crates.io",
        "rubygems.org",
        "github.com",
        "codeload.github.com",
        "objects.githubusercontent.com",
        "raw.githubusercontent.com",
        "release-assets.githubusercontent.com",
        "gitlab.com",
        "binaries.soliditylang.org",
      ],
    });
    expect(DEFAULT_SANDBOX_ALLOWED_DOMAINS).toHaveLength(17);
  });

  it("merges normalized operator domains and removes duplicates", () => {
    expect(buildSandboxNetworkPolicy([" Git.Example ", "github.com", "git.example"])).toEqual({
      mode: "custom",
      allowedDomains: [...DEFAULT_SANDBOX_ALLOWED_DOMAINS, "git.example"],
    });
  });

  it.each([
    "https://git.example",
    "git.example/path",
    "*.example.com",
    "*",
    "192.168.1.10",
    "2001:db8::1",
    "git.example:8443",
    "bad..example",
  ])("rejects non-hostname domain %s", (domain) => {
    expect(() => buildSandboxNetworkPolicy([domain])).toThrow();
  });
});
