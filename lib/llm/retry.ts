// Transient upstream failures (provider overloaded, rate-limited, brief
// network blip) shouldn't force the user to manually click Generate again
// — reproduced live: Gemini's own 503 "currently experiencing high demand"
// on an otherwise-working setup. Retries only status codes that are
// genuinely worth retrying; a 400/401/404 fails immediately since retrying
// a bad request or bad key can't succeed on attempt 2.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return BASE_DELAY_MS * 2 ** (attempt - 1); // 1s, 2s, 4s, ...
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) throw err;
      await sleep(backoffMs(attempt));
      continue;
    }

    if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === maxAttempts) {
      return res;
    }

    // Honor the provider's own Retry-After if it sent one, else back off.
    const retryAfter = res.headers.get("retry-after");
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : NaN;
    await sleep(Number.isFinite(retryAfterMs) ? retryAfterMs : backoffMs(attempt));
  }

  // Unreachable given the loop above always returns or throws by the last
  // attempt, but keeps TypeScript happy about the return type.
  throw lastError ?? new Error("fetchWithRetry: exhausted attempts with no response");
}
