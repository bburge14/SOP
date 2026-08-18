import { sopJsonSchema } from "@/lib/llm/schema";
import { LlmAdapterError, type LlmAdapter } from "@/lib/llm/types";

const TOOL_NAME = "emit_sop";

/**
 * Uses Claude's tool-use with a forced tool_choice as a structured-output
 * mechanism: the model's only valid move is to call emit_sop with arguments
 * matching sopJsonSchema, so we get back well-formed JSON directly in
 * tool_use.input rather than having to scrape it out of prose.
 */
export class AnthropicAdapter implements LlmAdapter {
  readonly name = "anthropic";
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new LlmAdapterError("anthropic", "ANTHROPIC_API_KEY is not set");
    this.apiKey = apiKey;
    this.model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        tools: [
          {
            name: TOOL_NAME,
            description: "Emit the generated SOP as structured data.",
            input_schema: sopJsonSchema,
          },
        ],
        tool_choice: { type: "tool", name: TOOL_NAME },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new LlmAdapterError("anthropic", `API request failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    const toolUse = data.content?.find((block: { type: string }) => block.type === "tool_use");
    if (!toolUse) {
      throw new LlmAdapterError("anthropic", "Response contained no tool_use block");
    }

    return JSON.stringify(toolUse.input);
  }
}
