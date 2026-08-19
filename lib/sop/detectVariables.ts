// Local, no-AI-call heuristic pass over imported document text: finds
// values that look like they're site/user-specific (IPs, MAC addresses,
// emails, explicit "fill this in" markers) and converts them in place into
// {{key}} placeholders, the same syntax a generated SOP already uses. Runs
// automatically on every import — nothing leaves the machine for this pass,
// unlike the optional AI-assisted scan (see lib/llm/prompt.ts's import
// analysis prompt) which a user explicitly opts into.
//
// Deliberately conservative: high-confidence patterns only. A generic
// "anything in [brackets] or <angle brackets>" rule would also catch
// markdown link text and stray HTML-ish text, so bracket placeholders are
// restricted to the common ALL-CAPS convention (<HOSTNAME>, <SITE_ID>) that
// doesn't collide with real markdown syntax.
const IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const MAC_RE = /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[A-Za-z]{2,}\b/g;
const ANGLE_PLACEHOLDER_RE = /<([A-Z][A-Z0-9_]{1,40})>/g;
const EXPLICIT_TOKEN_RE = /\b(?:TBD|TODO|FIXME|XXX|CHANGEME|REPLACE_ME)\b/g;
const BLANK_FILL_RE = /_{4,}/g;

interface RawMatch {
  value: string;
  baseKey: string;
}

export interface DetectedVariablesResult {
  /** Original text with every detected value replaced by a new {{key}} placeholder. */
  template: string;
  /** key -> the original value found, so the imported doc still renders identically until edited. */
  defaults: Record<string, string>;
}

function collectMatches(text: string): RawMatch[] {
  const matches: RawMatch[] = [];
  for (const m of text.matchAll(IP_RE)) matches.push({ value: m[0], baseKey: "ip_address" });
  for (const m of text.matchAll(MAC_RE)) matches.push({ value: m[0], baseKey: "mac_address" });
  for (const m of text.matchAll(EMAIL_RE)) matches.push({ value: m[0], baseKey: "email" });
  for (const m of text.matchAll(EXPLICIT_TOKEN_RE)) matches.push({ value: m[0], baseKey: "value_to_confirm" });
  for (const m of text.matchAll(BLANK_FILL_RE)) matches.push({ value: m[0], baseKey: "fill_in_value" });
  for (const m of text.matchAll(ANGLE_PLACEHOLDER_RE)) {
    const inner = m[1]!;
    const snake = inner
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    matches.push({ value: m[0], baseKey: snake || "placeholder" });
  }
  return matches;
}

function uniqueKey(base: string, used: Set<string>): string {
  let candidate = base;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${i}`;
    i++;
  }
  used.add(candidate);
  return candidate;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detects candidate variables in `text` and replaces them with {{key}}
 * placeholders. `existingKeys` (e.g. from {{key}} already present in the
 * document) is used to avoid key collisions — it is not scanned itself.
 */
export function detectAndTemplatizeVariables(text: string, existingKeys: ReadonlySet<string>): DetectedVariablesResult {
  const rawMatches = collectMatches(text);
  if (rawMatches.length === 0) return { template: text, defaults: {} };

  const usedKeys = new Set(existingKeys);
  const valueToKey = new Map<string, string>();
  const defaults: Record<string, string> = {};

  for (const { value, baseKey } of rawMatches) {
    if (valueToKey.has(value)) continue;
    const key = uniqueKey(baseKey, usedKeys);
    valueToKey.set(value, key);
    defaults[key] = value;
  }

  // Longest-first so one match can't be corrupted by another that happens
  // to be a substring of it (e.g. IP "10.0.0.1" is a substring of "10.0.0.10").
  const sortedValues = Array.from(valueToKey.keys()).sort((a, b) => b.length - a.length);
  const combined = new RegExp(sortedValues.map(escapeRegExp).join("|"), "g");
  const template = text.replace(combined, (matched) => `{{${valueToKey.get(matched)}}}`);

  return { template, defaults };
}
