// Turns a raw HTTP status + provider response body into a short, actionable
// sentence instead of dumping the provider's raw JSON error at the user
// (reported live: a Gemini 503 body — `{ "error": { "code": 503,
// "message": "This model is currently experiencing high demand..." } }` —
// rendered verbatim in the error banner). The raw body is still preserved
// as the error's `cause` for server-side logging and an optional
// "technical details" disclosure in the UI — this only changes what's
// shown by default, not what's discoverable.
const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  ollama: "Ollama",
};

function extractProviderMessage(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody);
    const msg = parsed?.error?.message ?? parsed?.message ?? (typeof parsed?.error === "string" ? parsed.error : null);
    return typeof msg === "string" && msg.trim() ? msg.trim() : null;
  } catch {
    return null;
  }
}

export function humanizeProviderError(provider: string, status: number, rawBody: string): string {
  const label = PROVIDER_LABELS[provider] ?? provider;
  const providerMsg = extractProviderMessage(rawBody);

  if (status === 401 || status === 403) {
    return `${label} rejected the API key. Check it in Settings.`;
  }
  if (status === 404) {
    if (provider === "ollama") {
      return `Ollama doesn't have this model pulled locally. Run "ollama pull <model>" first, or pick a different one in Settings.`;
    }
    return `${label} couldn't find the selected model. Try a different one in Settings — providers periodically retire older models.`;
  }
  if (status === 429) {
    return `${label} is rate-limiting requests right now. Wait a moment and try again.`;
  }
  if (status >= 500) {
    return `${label} is temporarily unavailable — this usually clears up within a minute. Try again shortly.`;
  }
  if (status === 400) {
    return `${label} rejected the request${providerMsg ? `: ${providerMsg}` : "."}`;
  }
  return `${label} returned an unexpected error (status ${status})${providerMsg ? `: ${providerMsg}` : "."}`;
}
