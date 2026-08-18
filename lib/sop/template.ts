import type { VariableValues } from "@/types/sop";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** All distinct {{key}} placeholder names referenced in a template, in first-seen order. */
export function extractPlaceholders(template: string): string[] {
  const seen = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const key = match[1];
    if (key) seen.add(key);
  }
  return Array.from(seen);
}

/**
 * Client-side substitution — no API round trip. Missing values fall back to
 * an empty string; unknown keys are left as the literal {{key}} so the user
 * can see at a glance what's still unbound.
 */
export function renderTemplate(template: string, values: VariableValues): string {
  return template.replace(PLACEHOLDER_RE, (full, key: string) => {
    if (!(key in values)) return full;
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  });
}
