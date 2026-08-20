export type VariableType = "string" | "number" | "boolean";

export interface SopVariable {
  key: string;
  label: string;
  description: string;
  default: string | number | boolean;
  type: VariableType;
}

export interface SopDocument {
  title: string;
  category: string;
  overview: string;
  prerequisites: string[];
  variables: SopVariable[];
  template_markdown: string;
}

export type VariableValues = Record<string, string | number | boolean>;

export type LlmProvider = "openai" | "gemini" | "ollama";

/**
 * A reference file (README, source, config, etc.) attached to a generation
 * request so the AI has ground truth about a specific — often internal or
 * non-public — tool/program instead of guessing at its behavior. Sent to
 * the AI provider alongside the topic; see the privacy notice in
 * TopicInput.tsx and README.md's "Privacy & data handling" section.
 *
 * `content` is already redacted (lib/sop/redactSecrets.ts) by the time it's
 * stored here — `redactedCount` (when > 0) is just for showing the user
 * that something was scrubbed, not a flag for further processing.
 */
export interface ContextAttachment {
  name: string;
  content: string;
  redactedCount?: number;
}

/**
 * A SOP saved to the local library (lib/sop/library.ts, IndexedDB — never
 * synced or sent anywhere). Loading one back into the workspace is a pure
 * local-state operation, same as Import — it never triggers an AI call by
 * itself, so nothing here is ever seen by the AI unless you take one of the
 * app's existing explicit AI actions (Generate/Regenerate/Scan with
 * AI/Review & Improve) after loading it into the active session.
 */
export interface SavedSop {
  id: string;
  title: string;
  category: string;
  overview: string;
  prerequisites: string[];
  variables: SopVariable[];
  values: VariableValues;
  template: string;
  topic: string;
  createdAt: string;
  updatedAt: string;
}

/** One candidate SOP topic proposed by "Suggest Ideas" from attached reference material. */
export interface SopIdea {
  title: string;
  description: string;
}

/** A reusable {{key}} default remembered for a category, e.g. management_vlan -> "10". */
export interface CategoryProfileDefault {
  key: string;
  label: string;
  value: string | number | boolean;
  type: VariableType;
}

/**
 * Reusable, per-category setup — local-only (lib/sop/categoryProfiles.ts,
 * IndexedDB, same "never synced or sent anywhere" guarantee as the
 * library). Building an SOP tagged with a category that has a saved
 * profile feeds `context` to the AI as grounding (same mechanism as
 * Attach Reference) and pre-fills any variable whose key matches one in
 * `defaults` — so the environment facts you've already told it about
 * "User Reset" or "Meraki Networking" don't have to be re-typed or
 * re-discovered by the AI every time. `categoryKey` is the normalized
 * (trimmed, lowercased) matching key; `category` keeps the original
 * casing for display.
 */
export interface CategoryProfile {
  categoryKey: string;
  category: string;
  context: string;
  defaults: CategoryProfileDefault[];
  updatedAt: string;
}
