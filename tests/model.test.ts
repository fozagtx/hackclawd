import { generateText } from "ai";
import { describe, expect, it, vi } from "vitest";
import { parseConfig } from "../src/config.js";
import { createNebiusModel } from "../src/model.js";

describe("createNebiusModel", () => {
  it("uses the configured model and the verified 256K context window", () => {
    const model = createNebiusModel(
      parseConfig({
        NEBIUS_API_KEY: "model-key",
        NEBIUS_BASE_URL: "https://inference.example/v1/",
        NEBIUS_MODEL: "example/code",
      }),
    );

    expect(model.model.modelId).toBe("example/code");
    expect(model.model.provider).toBe("nebius.chat");
    expect(model.modelContextWindowTokens).toBe(256_000);
  });

  it("accepts a vLLM response whose tool_calls field is null", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            id: "chatcmpl-1",
            object: "chat.completion",
            created: 1,
            model: "moonshotai/Kimi-K2.7-Code",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "ready", tool_calls: null },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
          }),
          { headers: { "content-type": "application/json" } },
        ),
    );
    const result = createNebiusModel(parseConfig({ NEBIUS_API_KEY: "test-key" }), fetchMock);

    const response = await generateText({
      model: result.model,
      prompt: "reply ready",
    });

    expect(response.text).toBe("ready");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://api.tokenfactory.nebius.com/v1/chat/completions",
    );
  });

  it("fails clearly on a model call without a configured API key", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const result = createNebiusModel(parseConfig({}), fetchMock);

    await expect(generateText({ model: result.model, prompt: "reply ready" })).rejects.toThrow(
      "NEBIUS_API_KEY is required",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
