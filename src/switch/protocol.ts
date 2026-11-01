import { z } from "zod";

const connectionStateSchema = z
  .object({
    type: z.literal("connection_state"),
    connection_id: z.string().min(1),
    agent_id: z.string().min(1),
    generation: z.number().int().nonnegative(),
    scope: z.string(),
    filter: z.string(),
    rooms: z.array(z.unknown()).optional(),
    cursor: z.number().int().nonnegative(),
    heartbeat_interval_seconds: z.number().positive(),
  })
  .passthrough();

const pingSchema = z.object({ type: z.literal("ping") }).passthrough();

const gapSchema = z
  .object({
    type: z.literal("gap"),
    cursor: z.number().int().nonnegative().optional(),
    new_cursor: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const evictedSchema = z
  .object({
    type: z.literal("evicted"),
    code: z.string().optional(),
    reason: z.string().optional(),
  })
  .passthrough();

const messageEventSchema = z
  .object({
    event: z.literal("message"),
    id: z.union([z.number().int().nonnegative(), z.string()]).optional(),
    data: z
      .object({
        type: z.literal("message"),
        room_id: z.string().min(1),
        bridge_id: z.string().optional(),
        channel_type: z.string().optional(),
        sequence: z.number().int().nonnegative(),
        payload: z
          .object({
            addressed: z.boolean(),
            sender: z.string(),
            sender_name: z.string(),
            message_id: z.string().min(1),
            body: z.string(),
            timestamp: z.number(),
            thread_id: z.string().nullable(),
            attachments: z.array(z.unknown()).optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

const domainEventSchema = z
  .object({
    event: z.string().min(1),
    id: z.union([z.number().int().nonnegative(), z.string()]).optional(),
    data: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export type SwitchConnectionState = z.infer<typeof connectionStateSchema>;
export type SwitchMessageEvent = z.infer<typeof messageEventSchema>;
export type SwitchPingFrame = z.infer<typeof pingSchema>;
export type SwitchGapFrame = z.infer<typeof gapSchema>;
export type SwitchEvictedFrame = z.infer<typeof evictedSchema>;
export type SwitchFrame =
  | SwitchConnectionState
  | SwitchPingFrame
  | SwitchGapFrame
  | SwitchEvictedFrame
  | SwitchMessageEvent
  | z.infer<typeof domainEventSchema>;

export function isSwitchConnectionState(frame: SwitchFrame): frame is SwitchConnectionState {
  return "type" in frame && frame.type === "connection_state";
}

export function isSwitchPingFrame(frame: SwitchFrame): frame is SwitchPingFrame {
  return "type" in frame && frame.type === "ping";
}

export function isSwitchGapFrame(frame: SwitchFrame): frame is SwitchGapFrame {
  return "type" in frame && frame.type === "gap";
}

export function isSwitchEvictedFrame(frame: SwitchFrame): frame is SwitchEvictedFrame {
  return "type" in frame && frame.type === "evicted";
}

export function isSwitchMessageEvent(frame: SwitchFrame): frame is SwitchMessageEvent {
  return "event" in frame && frame.event === "message";
}

export function parseSwitchFrame(raw: string | Buffer | ArrayBuffer): SwitchFrame {
  let value: unknown;
  try {
    value = JSON.parse(
      typeof raw === "string"
        ? raw
        : Buffer.isBuffer(raw)
          ? raw.toString("utf8")
          : Buffer.from(raw).toString("utf8"),
    );
  } catch {
    throw new Error("Switch frame is not valid JSON.");
  }

  if (typeof value !== "object" || value === null) {
    throw new Error("Switch frame must be an object.");
  }
  const frame = value as Record<string, unknown>;
  if (frame.type === "connection_state") return connectionStateSchema.parse(value);
  if (frame.type === "ping") return pingSchema.parse(value);
  if (frame.type === "gap") return gapSchema.parse(value);
  if (frame.type === "evicted") return evictedSchema.parse(value);
  if (frame.event === "message") return messageEventSchema.parse(value);
  if (typeof frame.event === "string") return domainEventSchema.parse(value);
  if (typeof frame.type === "string") return frame as SwitchFrame;
  throw new Error("Switch frame has no recognized type.");
}
