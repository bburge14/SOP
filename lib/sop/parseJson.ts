/**
 * Providers that don't offer guaranteed structured output (notably Ollama,
 * and any model that ignores tool_choice) sometimes wrap JSON in prose or
 * markdown code fences, or emit trailing commas. This does progressively
 * more aggressive cleanup passes and re-attempts JSON.parse after each one,
 * so a single malformed response doesn't fail the whole generation.
 */
export function extractAndParseJson(raw: string): unknown {
  const attempts: string[] = [raw.trim()];

  // Strip ```json ... ``` or ``` ... ``` fences.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  // Slice from the first { to its matching closing } via brace counting,
  // so leading/trailing prose ("Here is the SOP:") doesn't break parsing.
  const braceSliced = sliceBalancedObject(raw);
  if (braceSliced) attempts.push(braceSliced);
  if (fenced?.[1]) {
    const fencedSliced = sliceBalancedObject(fenced[1]);
    if (fencedSliced) attempts.push(fencedSliced);
  }

  const errors: string[] = [];
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
    // Last-resort fix: trailing commas before a closing } or ].
    try {
      const deTrailed = candidate.replace(/,(\s*[}\]])/g, "$1");
      return JSON.parse(deTrailed);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(
    `Could not parse a JSON object out of the model response after ${attempts.length} attempt(s). Last errors: ${errors
      .slice(-2)
      .join(" | ")}`
  );
}

function sliceBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (char === "\\") {
        escapeNext = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}
