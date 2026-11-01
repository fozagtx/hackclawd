import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Config } from "../config.js";
import { readiness } from "../config.js";
import { type Report, ReportStoreError } from "../reports/store.js";

const auditSchema = z.object({
  program: z.string().trim().min(1),
  scope: z.record(z.string(), z.unknown()).optional(),
  threadId: z.string().trim().min(1).optional(),
});

type AuditDelivery = {
  deliveryId: string;
  sessionId: string;
};

export type ApiFrom = (address: string) => {
  send(message: string, options: { auth: null; idempotencyKey?: string }): Promise<AuditDelivery>;
};

type ApiDependencies = {
  config: Config;
  store: {
    list(): Promise<Report[]>;
    get(id: string): Promise<Report | null>;
    confirmFinding(reportId: string, findingId: string): Promise<Report>;
  };
};

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function secureValueMatches(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function bearerTokenMatches(request: Request, expected: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  return Boolean(match?.[1] && secureValueMatches(match[1], expected));
}

function authorize(request: Request, config: Config): Response | null {
  if (!config.hackclawdApiKey) {
    return errorResponse(503, "not_configured", "HACKCLAWD_API_KEY is not configured.");
  }
  if (!bearerTokenMatches(request, config.hackclawdApiKey)) {
    return errorResponse(401, "unauthorized", "A valid bearer token is required.");
  }
  return null;
}

function jsonContentType(request: Request): boolean {
  return (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() === "application/json"
  );
}

async function readJson(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be valid JSON.");
  }
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

function markdownAccepts(request: Request): boolean {
  const accept = request.headers.get("accept");
  return Boolean(accept?.split(",").some((entry) => entry.trim().startsWith("text/markdown")));
}

function unsupportedAccept(request: Request): boolean {
  const accept = request.headers.get("accept");
  if (!accept) return false;
  return (
    !accept.includes("*/*") &&
    !accept.includes("application/json") &&
    !accept.includes("text/markdown") &&
    !accept.includes("application/*") &&
    !accept.includes("text/*")
  );
}

export function createApiHandlers(dependencies: ApiDependencies) {
  const { config, store } = dependencies;

  function health(): Response {
    return Response.json({ ok: true, readiness: readiness(config) });
  }

  async function audits(request: Request, from: ApiFrom): Promise<Response> {
    const authError = authorize(request, config);
    if (authError) return authError;
    if (!jsonContentType(request)) {
      return errorResponse(415, "unsupported_media_type", "Content-Type must be application/json.");
    }
    const body = await readJson(request);
    if (isResponse(body)) return body;
    const parsed = auditSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        400,
        "invalid_request",
        "Audit requires a program and valid optional scope and threadId.",
      );
    }

    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (
      request.headers.has("idempotency-key") &&
      (!idempotencyKey || idempotencyKey.length > 256)
    ) {
      return errorResponse(
        400,
        "invalid_request",
        "Idempotency-Key must contain between 1 and 256 characters.",
      );
    }
    const address =
      parsed.data.threadId ?? (idempotencyKey ? `api:${idempotencyKey}` : `api:${randomUUID()}`);
    const prompt = [
      `Program details:\n${parsed.data.program}`,
      parsed.data.scope ? `Scope:\n${JSON.stringify(parsed.data.scope, null, 2)}` : "",
      "Confirm authorization and scope before auditing. Ask if either is unclear.",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const delivery = await from(address).send(prompt, {
        auth: null,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });
      return Response.json(
        {
          accepted: true,
          address,
          deliveryId: delivery.deliveryId,
          sessionId: delivery.sessionId,
        },
        { status: 202 },
      );
    } catch {
      return errorResponse(503, "delivery_failed", "The audit request could not be delivered.");
    }
  }

  async function reports(request: Request): Promise<Response> {
    const authError = authorize(request, config);
    if (authError) return authError;
    return Response.json(await store.list());
  }

  async function report(request: Request, id: string): Promise<Response> {
    const authError = authorize(request, config);
    if (authError) return authError;
    if (unsupportedAccept(request)) {
      return errorResponse(
        415,
        "unsupported_media_type",
        "Accept must include application/json or text/markdown.",
      );
    }
    const found = await store.get(id);
    if (!found) return errorResponse(404, "report_not_found", "Report was not found.");
    if (markdownAccepts(request)) {
      return new Response(found.markdown, {
        headers: { "content-type": "text/markdown; charset=utf-8" },
      });
    }
    return Response.json(found);
  }

  async function confirmFinding(
    request: Request,
    reportId: string,
    findingId: string,
  ): Promise<Response> {
    const authError = authorize(request, config);
    if (authError) return authError;
    try {
      return Response.json(await store.confirmFinding(reportId, findingId));
    } catch (error) {
      if (error instanceof ReportStoreError) {
        if (error.code === "finding_already_confirmed") {
          return errorResponse(409, error.code, "Finding is already confirmed.");
        }
        return errorResponse(404, error.code, "Report or finding was not found.");
      }
      return errorResponse(503, "report_update_failed", "Finding confirmation could not be saved.");
    }
  }

  return { health, audits, reports, report, confirmFinding };
}
