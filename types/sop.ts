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
 */
export interface ContextAttachment {
  name: string;
  content: string;
}
