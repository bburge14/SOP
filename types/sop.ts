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
