import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiHandlers } from "../src/api/handlers.js";
import { parseConfig } from "../src/config.js";
import { createReportStore } from "../src/reports/store.js";

describe("API handlers", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "hackclawd-api-"));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  function handlers(options: { apiKey?: string } = {}) {
    return {
      api: createApiHandlers({
        config: parseConfig({
          HACKCLAWD_API_KEY: options.apiKey ?? "test-api-key",
          HACKCLAWD_DATA_DIR: dataDir,
        }),
        store: createReportStore(dataDir),
      }),
    };
  }

  it("leaves health public and protects reports with bearer auth", async () => {
    const { api } = handlers();

    const health = await api.health();
    const missing = await api.reports(new Request("http://local/api/reports"));
    const wrong = await api.reports(
      new Request("http://local/api/reports", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    const correct = await api.reports(
      new Request("http://local/api/reports", {
        headers: { authorization: "Bearer test-api-key" },
      }),
    );

    expect(health.status).toBe(200);
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(correct.status).toBe(200);
  });

  it("returns a service error when API auth is not configured", async () => {
    const { api } = handlers({ apiKey: "" });

    const response = await api.reports(new Request("http://local/api/reports"));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "not_configured" },
    });
  });

  it("rejects invalid JSON content types and invalid audit bodies", async () => {
    const { api } = handlers();
    const headers = {
      authorization: "Bearer test-api-key",
      "content-type": "application/json",
    };

    const unsupportedType = await api.audits(
      new Request("http://local/api/audits", {
        method: "POST",
        headers: { authorization: headers.authorization, "content-type": "text/plain" },
        body: "program",
      }),
      (_address: string) => ({
        send: async () => ({ deliveryId: "delivery-1", sessionId: "session-1" }),
      }),
    );
    const invalid = await api.audits(
      new Request("http://local/api/audits", {
        method: "POST",
        headers,
        body: JSON.stringify({ program: "" }),
      }),
      (_address: string) => ({
        send: async () => ({ deliveryId: "delivery-1", sessionId: "session-1" }),
      }),
    );

    expect(unsupportedType.status).toBe(415);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: { code: "invalid_request" },
    });
  });

  it("passes the idempotency key to the session delivery and returns delivery info", async () => {
    const send = vi.fn(
      async (
        _address: string,
        _message: string,
        _options?: {
          auth?: null;
          idempotencyKey?: string;
        },
      ) => ({
        deliveryId: "delivery-abc",
        sessionId: "session-xyz",
      }),
    );
    const { api } = handlers();

    const response = await api.audits(
      new Request("http://local/api/audits", {
        method: "POST",
        headers: {
          authorization: "Bearer test-api-key",
          "content-type": "application/json",
          "idempotency-key": "audit-123",
        },
        body: JSON.stringify({
          program: "Acme",
          scope: { repository: "https://example.invalid/acme/repo" },
          threadId: "ticket-9",
        }),
      }),
      (address) => ({
        send: (message, options) => send(address, message, options),
      }),
    );

    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledWith("ticket-9", expect.stringContaining("Acme"), {
      auth: null,
      idempotencyKey: "audit-123",
    });
    expect(await response.json()).toMatchObject({
      address: "ticket-9",
      deliveryId: "delivery-abc",
      sessionId: "session-xyz",
    });
  });

  it("sets an explicit Eve auth context when no idempotency key is supplied", async () => {
    const send = vi.fn(
      async (_message: string, _options?: { auth?: null; idempotencyKey?: string }) => ({
        deliveryId: "delivery-abc",
        sessionId: "session-xyz",
      }),
    );
    const { api } = handlers();

    const response = await api.audits(
      new Request("http://local/api/audits", {
        method: "POST",
        headers: {
          authorization: "Bearer test-api-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({ program: "Reply with ready" }),
      }),
      () => ({ send }),
    );

    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledWith(expect.stringContaining("Reply with ready"), {
      auth: null,
    });
  });

  it("returns Markdown when requested and JSON otherwise", async () => {
    const { api } = handlers();
    const report = await createReportStore(dataDir).create({
      sessionAddress: "room-1",
      program: "Acme",
      markdown: "# Report body",
      findings: [],
    });
    const auth = { authorization: "Bearer test-api-key" };

    const markdown = await api.report(
      new Request("http://local/api/reports/x", {
        headers: { ...auth, accept: "text/markdown" },
      }),
      report.id,
    );
    const json = await api.report(
      new Request("http://local/api/reports/x", { headers: auth }),
      report.id,
    );

    expect(markdown.headers.get("content-type")).toContain("text/markdown");
    expect(await markdown.text()).toBe("# Report body");
    expect(json.headers.get("content-type")).toContain("application/json");
    expect(await json.json()).toEqual(report);
  });

  it("confirms findings through the authenticated human endpoint", async () => {
    const { api } = handlers();
    const report = await createReportStore(dataDir).create({
      sessionAddress: "room-1",
      program: "Acme",
      markdown: "# Report body",
      findings: [{ title: "IDOR", severity: "high" }],
    });
    const findingId = report.findings[0]?.id;
    expect(findingId).toBeDefined();

    const unauthorized = await api.confirmFinding(
      new Request("http://local/confirm", { method: "POST" }),
      report.id,
      findingId,
    );
    const confirmed = await api.confirmFinding(
      new Request("http://local/confirm", {
        method: "POST",
        headers: { authorization: "Bearer test-api-key" },
      }),
      report.id,
      findingId,
    );
    const duplicate = await api.confirmFinding(
      new Request("http://local/confirm", {
        method: "POST",
        headers: { authorization: "Bearer test-api-key" },
      }),
      report.id,
      findingId,
    );

    expect(unauthorized.status).toBe(401);
    expect(confirmed.status).toBe(200);
    expect((await confirmed.json()).findings[0].status).toBe("confirmed");
    expect(duplicate.status).toBe(409);
  });
});
