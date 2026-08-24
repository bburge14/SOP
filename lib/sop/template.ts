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
 * Client-side substitution — no API round trip. Unknown keys are left as
 * the literal {{key}}, and so is a declared key with a genuinely empty
 * value ("", null, undefined) — many of these SOPs are reused across many
 * different sites/devices, so a field being unfilled is completely normal,
 * not an error to call out. An earlier version rendered an empty field as
 * `[Field Label]` inline in the sentence ("...at [Site Name]..."), which
 * read like broken prose and showed up constantly for anyone whose
 * templates stay mostly unfilled by design; leaving the literal {{key}}
 * in place instead reads unambiguously as "this is a template slot," the
 * same way an unrecognized placeholder already does, and is still styled
 * distinctly (see `.unbound-placeholder` in globals.css /
 * remarkSubstituteVariables.ts) so it's not literally invisible either.
 */
export function renderTemplate(template: string, values: VariableValues): string {
  return template.replace(PLACEHOLDER_RE, (full, key: string) => {
    if (!(key in values)) return full;
    const value = values[key];
    if (value === undefined || value === null || value === "") return full;
    return String(value);
  });
}
