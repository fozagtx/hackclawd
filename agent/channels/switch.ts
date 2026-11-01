import { defineChannel, POST } from "eve/channels";
import { z } from "zod";
import { secureValueMatches } from "../../src/api/handlers.js";
import { config } from "../../src/config.js";
import {
  asDeliverableReport,
  celebrationHeader,
  reportFileContent,
  reportFilename,
} from "../../src/reports/delivery.js";
import { SwitchHttpClient } from "../../src/switch/http.js";
import { ACKNOWLEDGEMENT, progressUpdate } from "../../src/switch/progress.js";
import { RunRegistry, statusMessage, targetFromMessage } from "../../src/switch/run-status.js";

type SwitchChannelState = {
  roomId: string | null;
  threadId: string | null;
  progress: string[];
};

const eventSchema = z.object({
  roomId: z.string().min(1),
  threadId: z.string().nullable(),
  messageId: z.string().min(1),
  senderName: z.string().min(1),
  body: z.string().min(1),
});

const switchHttp =
  config.switchUrl && config.switchAgentId && config.switchAgentApiKey
    ? new SwitchHttpClient({
        baseUrl: config.switchUrl,
        agentId: config.switchAgentId,
        apiKey: config.switchAgentApiKey,
      })
    : undefined;

const runs = new RunRegistry();

function addressOf(state: SwitchChannelState): string | null {
  if (!state.roomId) return null;
  return state.threadId ? `${state.roomId}:${state.threadId}` : state.roomId;
}

async function postProgress(roomId: string | null, content: string): Promise<void> {
  if (!roomId || !switchHttp) return;
  try {
    await switchHttp.postMessage(roomId, content);
  } catch (error) {
    console.warn(`Could not post progress to Switch: ${(error as Error).message}`);
  }
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export default defineChannel<SwitchChannelState, { state: SwitchChannelState }>({
  state: { roomId: null, threadId: null, progress: [] },
  context(state) {
    return { state };
  },
  routes: [
    POST("/switch/events", async (request, { from }) => {
      if (!config.hackclawdApiKey) {
        return errorResponse(503, "not_configured", "HACKCLAWD_API_KEY is not configured.");
      }
      const bridgeSecret = request.headers.get("x-hackclawd-bridge-secret");
      if (!bridgeSecret || !secureValueMatches(bridgeSecret, config.hackclawdApiKey)) {
        return errorResponse(401, "unauthorized", "A valid bridge secret is required.");
      }
      if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
        return errorResponse(
          415,
          "unsupported_media_type",
          "Content-Type must be application/json.",
        );
      }
      let input: unknown;
      try {
        input = await request.json();
      } catch {
        return errorResponse(400, "invalid_json", "Request body must be valid JSON.");
      }
      const parsed = eventSchema.safeParse(input);
      if (!parsed.success) {
        return errorResponse(
          400,
          "invalid_request",
          "Switch event is missing required message fields.",
        );
      }
      const event = parsed.data;
      const address = event.threadId ? `${event.roomId}:${event.threadId}` : event.roomId;
      const active = runs.snapshot(address);
      const reply = active ? statusMessage(active, Date.now()) : ACKNOWLEDGEMENT;
      if (!active) runs.start(address, targetFromMessage(event.body), Date.now());
      const delivery = await from(address).send(event.body, {
        auth: null,
        idempotencyKey: event.messageId,
        state: { roomId: event.roomId, threadId: event.threadId },
      });
      await postProgress(event.roomId, reply);
      return Response.json(
        { accepted: true, deliveryId: delivery.deliveryId, sessionId: delivery.sessionId },
        { status: 202 },
      );
    }),
  ],
  events: {
    "turn.started"(_event, ctx) {
      ctx.channel.state.progress = [];
    },
    async "call.requested"(event, ctx) {
      const { capability, input } = event.data;
      const update = progressUpdate(
        { name: capability.name, kind: capability.kind, input },
        ctx.channel.state.progress ?? [],
      );
      if (!update) return;
      ctx.channel.state.progress = [...(ctx.channel.state.progress ?? []), update.stage];
      const address = addressOf(ctx.channel.state);
      if (address) runs.recordStage(address, update.stage);
      await postProgress(ctx.channel.state.roomId, update.message);
    },
    "turn.settled"(_event, ctx) {
      const address = addressOf(ctx.channel.state);
      if (address) runs.finish(address);
    },
    async "call.settled"(event, ctx) {
      const roomId = ctx.channel.state.roomId;
      if (!roomId || !switchHttp || event.data.outcome !== "completed") return;
      const report = asDeliverableReport(event.data.output);
      if (!report) return;
      const header = celebrationHeader(report.findings);
      if (header) await postProgress(roomId, header);
      try {
        await switchHttp.postMedia(
          roomId,
          {
            filename: reportFilename(report.program, report.id),
            mimetype: "text/markdown",
            data: new TextEncoder().encode(reportFileContent(report.markdown)),
          },
          `Full report for ${report.program}. Report ID ${report.id}.`,
        );
      } catch (error) {
        console.warn(`Could not upload report file to Switch: ${(error as Error).message}`);
      }
    },
    async "content.completed"(event, ctx) {
      if (
        event.data.kind !== "text" ||
        typeof event.data.value !== "string" ||
        !event.data.value.trim()
      ) {
        return;
      }
      const roomId = ctx.channel.state.roomId;
      if (!roomId || !switchHttp) return;
      await switchHttp.postMessage(roomId, event.data.value);
    },
  },
});
