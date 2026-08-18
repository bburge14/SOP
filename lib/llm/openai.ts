import { sopJsonSchema } from "@/lib/llm/schema";
import { LlmAdapterError, type LlmAdapter } from "@/lib/llm/types";

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
    if (!apiKey) throw new LlmAdapterError("openai", "OPENAI_API_KEY is not set");
    this.apiKey = apiKey;
    this.model = process.env.OPENAI_MODEL || "gpt-4o";
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
              description: "Emit the generated SOP as structured data.",
              parameters: sopJsonSchema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: FUNCTION_NAME } },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new LlmAdapterError("openai", `API request failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new LlmAdapterError("openai", "Response contained no tool call arguments");
    }

    return toolCall.function.arguments as string;
  }
}
