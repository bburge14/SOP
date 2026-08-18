import { sopZodSchema } from "@/lib/llm/schema";
import type { SopDocument, SopVariable } from "@/types/sop";
import { extractPlaceholders } from "@/lib/sop/template";

/**
 * Validates raw parsed JSON against the SOP schema, then reconciles the
 * variables array against the placeholders actually present in
 * template_markdown. Models occasionally forget to declare a variable it
 * used inline, or declare one it never used — both are auto-corrected here
 * rather than surfaced as a hard failure, since the JSON already passed
 * schema validation and a strict re-prompt loop isn't worth the latency.
 */
export function validateAndReconcile(parsed: unknown): SopDocument {
  const sop = sopZodSchema.parse(parsed);
  const placeholders = extractPlaceholders(sop.template_markdown);
  const declaredKeys = new Set(sop.variables.map((v) => v.key));

  const synthesized: SopVariable[] = placeholders
    .filter((key) => !declaredKeys.has(key))
    .map((key) => ({
      key,
      label: humanizeKey(key),
      description: "Auto-detected placeholder not declared by the model.",
      default: "",
      type: "string" as const,
    }));

  const placeholderSet = new Set(placeholders);
  const usedVariables = sop.variables.filter((v) => placeholderSet.has(v.key));

  return {
    ...sop,
    variables: [...usedVariables, ...synthesized],
  };
}

function humanizeKey(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}
