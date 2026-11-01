import { describe, expect, it } from "vitest";
import { parseSwitchFrame } from "../src/switch/protocol.js";

describe("Switch frame parser", () => {
  it("parses connection, heartbeat, gap, eviction, and message frames", () => {
    expect(
      parseSwitchFrame(
        JSON.stringify({
          type: "connection_state",
          connection_id: "connection-1",
          agent_id: "agent-1",
          generation: 4,
          scope: "all",
          filter: "addressed",
          cursor: 20,
          heartbeat_interval_seconds: 2,
        }),
      ),
    ).toMatchObject({ type: "connection_state", generation: 4 });

    expect(parseSwitchFrame('{"type":"ping"}')).toMatchObject({ type: "ping" });
    expect(parseSwitchFrame('{"type":"gap","cursor":21}')).toMatchObject({
      type: "gap",
      cursor: 21,
    });
    expect(parseSwitchFrame('{"type":"evicted","code":"taken_over"}')).toMatchObject({
      type: "evicted",
      code: "taken_over",
    });
    expect(
      parseSwitchFrame(
        JSON.stringify({
          event: "message",
          id: 22,
          data: {
            type: "message",
            room_id: "room-1",
            bridge_id: "bridge-1",
            channel_type: "slack",
            sequence: 22,
            payload: {
              addressed: true,
              sender: "user-1",
              sender_name: "Researcher",
              message_id: "message-1",
              body: "Assess this program",
              timestamp: 1_700_000_000_000,
              thread_id: null,
              attachments: [],
            },
          },
        }),
      ),
    ).toMatchObject({ event: "message", data: { sequence: 22 } });
  });

  it("rejects malformed JSON and malformed message frames", () => {
    expect(() => parseSwitchFrame("{")).toThrow();
    expect(() =>
      parseSwitchFrame(
        JSON.stringify({
          event: "message",
          id: 1,
          data: { type: "message", payload: { addressed: "yes" } },
        }),
      ),
    ).toThrow();
  });
});
