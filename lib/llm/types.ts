/**
 * Every provider adapter returns the raw text/JSON it got back from the
 * model, unvalidated. Parsing (extractAndParseJson) and schema validation
 * (validateAndReconcile) happen once, centrally, in the API route — so
 * adapters stay dumb: build a request, call the API, hand back a string.
 */
export interface LlmAdapter {
  readonly name: string;
  /**
   * `jsonSchema` constrains the response shape via each provider's own
   * structured-output mechanism (OpenAI function-calling parameters,
   * Gemini responseSchema, a schema hint embedded in Ollama's prompt) — it
   * used to be hardcoded per-adapter to the single-SOP shape, which would
   * have silently forced every response (including a list-of-ideas
   * response) into that shape regardless of what the prompt actually asked
   * for.
   */
  generate(systemPrompt: string, userPrompt: string, jsonSchema: object): Promise<string>;
}

export class LlmAdapterError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly cause?: unknown
  ) {
    super(`[${provider}] ${message}`);
    this.name = "LlmAdapterError";
  }
}

/**
 * Thrown specifically for "no API key/config set up" — distinct from
 * LlmAdapterError so the API route can tell "not configured yet" (500,
 * fix the setup) apart from "the provider's request failed" (502, maybe
 * transient) without string-matching the message text, which broke once
 * before when the wording changed but the check didn't.
 */
export class LlmConfigError extends LlmAdapterError {
  constructor(provider: string, message: string) {
    super(provider, message);
    this.name = "LlmConfigError";
  }
}
