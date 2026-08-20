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

/**
 * Un-parameterizes one {{key}}: replaces every occurrence in the template
 * with a literal value (or removes it entirely if empty), for when a field
 * shouldn't have been a variable at all — e.g. a value only discovered
 * live during the procedure (a serial number read off a device) that the
 * generation prompt now tries to avoid parameterizing, but won't always
 * get right. `key` is safe to embed directly: variable keys are already
 * constrained to plain identifier characters (no regex metacharacters) by
 * sopZodSchema/AddFieldDialog before they ever reach this function.
 */
export function unparameterize(template: string, key: string, literal: string): string {
  const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
  return template.replace(re, literal);
}
