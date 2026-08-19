import { LlmAdapterError, LlmConfigError, type LlmAdapter } from "@/lib/llm/types";
import { DEFAULT_OPENAI_MODEL } from "@/lib/llm/modelOptions";
import { fetchWithRetry } from "@/lib/llm/retry";
import { humanizeProviderError } from "@/lib/llm/humanizeError";

const FUNCTION_NAME = "emit_sop";

/**
 * Forces the response through a function call (tool_choice pinned to
 * emit_sop) rather than relying on prose + response_format:"json_object",
 * so the returned arguments are already schema-shaped JSON.
 */
export class OpenAiAdapter implements LlmAdapter {
  readonly name = "openai";
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new LlmConfigError("openai", "No OpenAI API key is configured — add one in Settings (or set OPENAI_API_KEY).");
    this.apiKey = apiKey;
    this.model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  }

  async generate(systemPrompt: string, userPrompt: string, jsonSchema: object): Promise<string> {
    const res = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: FUNCTION_NAME,
              description: "Emit the response as structured data.",
              parameters: jsonSchema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: FUNCTION_NAME } },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new LlmAdapterError("openai", humanizeProviderError("openai", res.status, body), body);
    }

    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new LlmAdapterError("openai", "Response contained no tool call arguments");
    }

    return toolCall.function.arguments as string;
  }
}
