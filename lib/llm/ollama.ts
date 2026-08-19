import { LlmAdapterError, type LlmAdapter } from "@/lib/llm/types";
import { fetchWithRetry } from "@/lib/llm/retry";
import { humanizeProviderError } from "@/lib/llm/humanizeError";

/**
 * Local models via Ollama vary widely in how reliably they honor structured
 * output, so this adapter takes a belt-and-suspenders approach: request
 * format:"json" (broadly supported across Ollama versions/models) AND spell
 * out the exact JSON Schema in the prompt itself. The extra robustness lives
 * downstream in lib/sop/parseJson.ts, which this route depends on more
 * heavily than the other three adapters.
 */
export class OllamaAdapter implements LlmAdapter {
  readonly name = "ollama";
  private readonly baseUrl: string;
  private readonly model: string;

  constructor() {
    this.baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
    this.model = process.env.OLLAMA_MODEL || "llama3.1";
  }

  async generate(systemPrompt: string, userPrompt: string, jsonSchema: object): Promise<string> {
    const schemaHint = `\n\nRespond with ONLY a single JSON object (no prose, no markdown fences) matching exactly this JSON Schema:\n${JSON.stringify(
      jsonSchema
    )}`;

    let res: Response;
    try {
      res = await fetchWithRetry(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: "json",
          messages: [
            { role: "system", content: systemPrompt + schemaHint },
            { role: "user", content: userPrompt },
          ],
        }),
      });
    } catch (err) {
      throw new LlmAdapterError(
        "ollama",
        `Could not reach Ollama at ${this.baseUrl} — is it running? (ollama serve)`,
        err
      );
    }

    if (!res.ok) {
      const body = await res.text();
      throw new LlmAdapterError("ollama", humanizeProviderError("ollama", res.status, body), body);
    }

    const data = await res.json();
    const content = data.message?.content;
    if (!content) {
      throw new LlmAdapterError("ollama", "Response contained no message content");
    }

    return content as string;
  }
}
