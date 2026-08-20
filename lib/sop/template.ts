import type { SopVariable, VariableValues } from "@/types/sop";

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
 * Client-side substitution — no API round trip. Unknown keys are left as
 * the literal {{key}}. A declared key with a genuinely empty value ("",
 * null, undefined — e.g. a unique identifier the AI deliberately left
 * blank instead of inventing a fake-looking one; see SOP_SYSTEM_PROMPT)
 * renders as `[Field Label]` rather than silently vanishing — an exported
 * document with an invisible gap where a serial number belongs is worse
 * than one that visibly says what's still missing. `variables` is only
 * used to look up that label; omitting it falls back to the raw key.
 */
export function renderTemplate(template: string, values: VariableValues, variables: SopVariable[] = []): string {
  const labelByKey = new Map(variables.map((v) => [v.key, v.label]));
  return template.replace(PLACEHOLDER_RE, (full, key: string) => {
    if (!(key in values)) return full;
    const value = values[key];
    if (value === undefined || value === null || value === "") {
      return `[${labelByKey.get(key) ?? key}]`;
    }
    return String(value);
  });
}
