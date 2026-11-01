import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { Config } from "./config.js";

// The Nebius models catalog lists the model ID; Kimi documents a 256K context window.
export const modelContextWindowTokens = 256_000;

export function createNebiusModel(config: Config, fetchImpl: typeof fetch = fetch) {
  const provider = createOpenAICompatible({
    name: "nebius",
    baseURL: config.nebiusBaseUrl,
    apiKey: config.nebiusApiKey,
    includeUsage: true,
    fetch: (input, init) => {
      if (!config.nebiusApiKey) {
        throw new Error("NEBIUS_API_KEY is required to call the model.");
      }
      return fetchImpl(input, init);
    },
  });

  return {
    model: provider(config.nebiusModel),
    modelContextWindowTokens,
  };
}
