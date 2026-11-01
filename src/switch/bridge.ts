import type { Config } from "../config.js";
import { SwitchClient } from "./client.js";
import type { SwitchMessageEvent } from "./protocol.js";

export function createSwitchBridge(config: Config, fetchImpl: typeof fetch = fetch): SwitchClient {
  if (!config.switchUrl || !config.switchAgentId || !config.switchAgentApiKey) {
    throw new Error(
      "SWITCH_URL, SWITCH_AGENT_ID, and SWITCH_AGENT_API_KEY are required to start the Switch bridge.",
    );
  }
  if (!config.hackclawdApiKey) {
    throw new Error("HACKCLAWD_API_KEY is required to authenticate the Switch bridge.");
  }
  const bridgeSecret = config.hackclawdApiKey;

  return new SwitchClient({
    baseUrl: config.switchUrl,
    agentId: config.switchAgentId,
    apiKey: config.switchAgentApiKey,
    dataDir: config.dataDir,
    onMessage: async (event: SwitchMessageEvent) => {
      const payload = event.data.payload;
      const response = await fetchImpl(`http://127.0.0.1:${config.port}/switch/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hackclawd-bridge-secret": bridgeSecret,
        },
        body: JSON.stringify({
          roomId: event.data.room_id,
          threadId: payload.thread_id,
          messageId: payload.message_id,
          senderName: payload.sender_name,
          body: payload.body,
        }),
      });
      if (!response.ok) {
        throw new Error(`Switch event bridge rejected the message with HTTP ${response.status}.`);
      }
    },
  });
}
