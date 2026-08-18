import { z } from "zod";

/**
 * Single source of truth for the shape of a generated SOP.
 * `sopZodSchema` validates parsed JSON at runtime; `sopJsonSchema` is the
 * plain JSON Schema fed to providers that support structured output
 * (OpenAI function parameters, Gemini responseSchema). Keep the two in
 * sync when the shape changes.
 */
export const sopZodSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  overview: z.string().min(1),
  prerequisites: z.array(z.string()).default([]),
  variables: z
    .array(
      z.object({
        key: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "must be a valid mustache key"),
        label: z.string().min(1),
        description: z.string().default(""),
        default: z.union([z.string(), z.number(), z.boolean()]),
        type: z.enum(["string", "number", "boolean"]),
      })
    )
    .default([]),
  template_markdown: z.string().min(1),
});

export const sopJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Clear, formal SOP title" },
    category: {
      type: "string",
      description: "Domain or category, e.g. Networking, SysAdmin, DevOps, Office",
    },
    overview: { type: "string", description: "1-2 sentence description of the procedure and its objective" },
    prerequisites: {
      type: "array",
      items: { type: "string" },
      description: "Required access, tools, or physical hardware",
    },
    variables: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Exact variable name used in the template, snake_case, must match a {{key}} placeholder",
          },
          label: { type: "string", description: "Human-readable label" },
          description: { type: "string", description: "Brief explanation of what value goes here" },
          // Modeled as a plain string (not a union) because Gemini's
          // responseSchema doesn't support multi-type fields. Callers coerce
          // using the sibling `type` field; zod still accepts a native
          // number/boolean too, since OpenAI doesn't enforce this strictly
          // and may return one.
          default: {
            type: "string",
            description: "Sensible default value as a string, coerced per `type` (e.g. \"true\", \"8443\", \"vlan10\")",
          },
          type: { type: "string", enum: ["string", "number", "boolean"] },
        },
        required: ["key", "label", "description", "default", "type"],
      },
    },
    template_markdown: {
      type: "string",
      description:
        "Full procedural SOP in Markdown. Use {{variable_key}} mustache placeholders for any environment-specific value. Include exact CLI commands, GUI paths, and verification steps.",
    },
  },
  required: ["title", "category", "overview", "prerequisites", "variables", "template_markdown"],
} as const;
