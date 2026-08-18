import { sopJsonSchema } from "@/lib/llm/schema";
import { LlmAdapterError, type LlmAdapter } from "@/lib/llm/types";
import { DEFAULT_GEMINI_MODEL } from "@/lib/llm/modelOptions";
import { fetchWithRetry } from "@/lib/llm/retry";

/**
 * Gemini takes the JSON Schema directly via generationConfig.responseSchema
 * plus responseMimeType:"application/json" — the model is constrained to
 * emit conforming JSON as plain text, no tool-call unwrapping needed.
 */
export class GeminiAdapter implements LlmAdapter {
  readonly name = "gemini";
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new LlmAdapterError("gemini", "GEMINI_API_KEY is not set");
    this.apiKey = apiKey;
    this.model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: sopJsonSchema,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new LlmAdapterError("gemini", `API request failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new LlmAdapterError("gemini", "Response contained no candidate text");
    }

    return text as string;
  }
}
