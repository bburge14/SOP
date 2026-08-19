// Best-effort local redaction of things that look like secrets (API keys,
// passwords, tokens, private keys) before content leaves the machine for
// any AI call — Attach Reference, Scan with AI, and Review & Improve all
// send full document/file content, not just a topic, so this runs on the
// outgoing copy in each of those paths. This is defense-in-depth, not a
// guarantee: it catches common, recognizable shapes, not every possible
// secret — the standing privacy notices still tell users not to rely on it
// instead of their own judgment.
interface SecretPattern {
  name: string;
  regex: RegExp;
}

const PRIVATE_KEY_BLOCK_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

// Well-known vendor token prefixes — distinctive enough shapes that false
// positives are rare, unlike a generic high-entropy-string heuristic (which
// would also flag legitimate hashes, commit SHAs, UUIDs, etc.).
const VENDOR_TOKEN_PATTERNS: SecretPattern[] = [
  { name: "AWS access key ID", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: "GitHub fine-grained token", regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "Stripe key", regex: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { name: "Google API key", regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { name: "OpenAI API key", regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: "SendGrid API key", regex: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g },
  { name: "JSON Web Token", regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
];

// scheme://user:password@host — the credential portion of a connection
// string/URL, a very common way secrets end up in READMEs and config.
const CREDENTIAL_URL_RE = /\b([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^:/\s@]+):([^@/\s]+)@/g;

// key: value / key = value where the key name itself signals a secret —
// catches config-file-style declarations (API_KEY=..., password: "...")
// regardless of vendor. Requires an explicit assignment operator right
// after the label, not just the word appearing in prose, to keep false
// positives low (e.g. "the auth token expires after an hour" doesn't match,
// since no [:=] immediately follows "token" there).
//
// The label is wrapped in [A-Za-z_]* rather than \b...\b: a strict word
// boundary doesn't fire between "_" and a letter (both are \w), so it
// missed the extremely common DB_PASSWORD / MY_API_KEY / MYSQL_PWD style of
// naming — reproduced live with a real "DB_PASSWORD=..." line that slipped
// through untouched. Absorbing surrounding identifier characters on both
// sides catches the label as a substring of a longer name instead.
const LABELED_SECRET_RE =
  /[A-Za-z_]*(?:api[_-]?keys?|secret(?:[_-]?keys?)?|access[_-]?keys?|private[_-]?keys?|client[_-]?secret|passwords?|passwd|pwd|auth[_-]?tokens?|access[_-]?tokens?|bearer[_-]?tokens?|tokens?|credentials?)[A-Za-z_]*\s*[:=]\s*['"]?([^\s'";,]{4,})['"]?/gi;

export interface RedactionResult {
  text: string;
  count: number;
}

export function redactSecrets(text: string): RedactionResult {
  let count = 0;
  let result = text;

  result = result.replace(PRIVATE_KEY_BLOCK_RE, () => {
    count++;
    return "[REDACTED: private key]";
  });

  for (const { name, regex } of VENDOR_TOKEN_PATTERNS) {
    result = result.replace(regex, () => {
      count++;
      return `[REDACTED: possible ${name}]`;
    });
  }

  result = result.replace(CREDENTIAL_URL_RE, (_full, scheme: string, user: string) => {
    count++;
    return `${scheme}://${user}:[REDACTED]@`;
  });

  result = result.replace(LABELED_SECRET_RE, (full: string, value: string) => {
    // A vendor-token or private-key pass above may have already replaced
    // this exact value with our own "[REDACTED..." placeholder — don't
    // count/re-wrap it a second time.
    if (value.startsWith("[REDACTED")) return full;
    count++;
    return full.slice(0, full.length - value.length) + "[REDACTED]";
  });

  return { text: result, count };
}
