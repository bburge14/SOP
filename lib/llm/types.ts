/**
 * Every provider adapter returns the raw text/JSON it got back from the
 * model, unvalidated. Parsing (extractAndParseJson) and schema validation
 * (validateAndReconcile) happen once, centrally, in the API route — so
 * adapters stay dumb: build a request, call the API, hand back a string.
 */
export interface LlmAdapter {
  readonly name: string;
  generate(systemPrompt: string, userPrompt: string): Promise<string>;
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
