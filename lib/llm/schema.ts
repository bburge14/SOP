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
      description:
        "Required access, tools, or physical hardware. For destructive/hard-to-reverse/broad-impact procedures, include an explicit pre-flight safety checkpoint here (e.g. confirm a snapshot/backup completed, verify break-glass access) before anything disruptive happens.",
    },
    variables: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description:
              "Exact variable name used in the template, snake_case, must match a {{key}} placeholder. Only for a value decided BEFORE running the procedure. Never declare a key for a value only discovered DURING the procedure — a serial number, asset tag, MAC address, a DHCP-assigned IP/gateway, an activation code generated on the spot. Those get no key at all; write them as plain prose in template_markdown instead.",
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
            description:
              "Sensible default value as a string, coerced per `type` (e.g. \"true\", \"8443\", \"vlan10\") — but for a variable that's genuinely unique per deployment with no common convention (an org/network name, a license key, a fixed per-site hostname/IP decided in advance), use \"\" instead of a fabricated-but-plausible example. A made-up value that looks real is worse than an honestly empty field. Do not declare a variable at all for a value only discovered during the procedure itself (a serial number read off a device, a DHCP-assigned IP) — that belongs in template_markdown as plain prose, never as a {{variable}}.",
          },
          type: { type: "string", enum: ["string", "number", "boolean"] },
        },
        required: ["key", "label", "description", "default", "type"],
      },
    },
    template_markdown: {
      type: "string",
      description:
        "Full procedural SOP in Markdown. Use {{variable_key}} mustache placeholders only for a value the operator decides BEFORE running the procedure (a target network name, a VLAN ID, a credential) — one canonical variable per underlying value, never split across redundant variables, and never leave a dependent value (e.g. a service/protocol tied to a port) hardcoded once the value it depends on is parameterized. Never use a {{variable}} for a value only discovered DURING the procedure (a serial number read off a device's label, a DHCP-assigned IP/gateway, an activation code generated on the spot) — write those as plain instructional prose describing exactly what to read or enter, with no placeholder at all. Include exact CLI commands, GUI paths, and verification steps. The rollback/cleanup section must use only real, executable commands — never bracketed pseudocode; if a step needs a runtime-assigned ID, include the actual lookup command followed by the actual command that uses its result. For any step built on a fact you cannot actually verify (an exact service name, config path, protocol availability, OS/platform, or other vendor-specific behavior invented rather than confirmed — common for internal or less-common tools), add a `> [!WARNING]` GitHub-style alert stating the assumption plainly, immediately after the step — do not present an unverified guess as settled fact.",
    },
  },
  required: ["title", "category", "overview", "prerequisites", "variables", "template_markdown"],
} as const;

/**
 * Shape for "Suggest Ideas" (app/api/suggest-ideas/route.ts) — a list of
 * candidate SOP topics grounded in attached reference material, not a full
 * SOP. Separate from sopJsonSchema/sopZodSchema on purpose: forcing this
 * response through the single-SOP shape (title/variables/template_markdown
 * etc.) would produce nonsense, since there's no single procedure yet, just
 * a list of ones worth writing.
 */
export const sopIdeasZodSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().min(1),
      })
    )
    .min(1),
});

export const sopIdeasJsonSchema = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "A short, specific SOP topic — phrased so it could be pasted directly into a 'generate an SOP for X' prompt as-is",
          },
          description: {
            type: "string",
            description: "1-2 sentences on why this SOP is worth writing, grounded in what the reference material actually describes",
          },
        },
        required: ["title", "description"],
      },
    },
  },
  required: ["ideas"],
} as const;

/**
 * Shape for "Guided" generation's clarifying-questions step
 * (app/api/clarify/route.ts) — asked before the real generation call so
 * someone who doesn't already know how to structure an SOP for this topic
 * gets prompted for the specifics a technical writer would actually need
 * (vendor/platform, environment, existing conventions, risk tolerance)
 * instead of having to think of them unprompted. Answers get appended to
 * the normal generate() call as grounding, same mechanism as a category
 * profile's context or attached reference material.
 */
export const clarifyingQuestionsZodSchema = z.object({
  questions: z
    .array(
      z.object({
        key: z.string().min(1),
        question: z.string().min(1),
        placeholder: z.string().default(""),
      })
    )
    .min(1)
    .max(8),
});

export const clarifyingQuestionsJsonSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", description: "Short snake_case identifier for this question, e.g. vendor_platform" },
          question: {
            type: "string",
            description:
              "One specific, concrete question a technical writer would need answered before writing this SOP well — not generic ('what's the topic?'), and answerable in a sentence or two, not an essay",
          },
          placeholder: {
            type: "string",
            description: "A short example answer shown as input placeholder text, e.g. 'Cisco Meraki MS225' or 'Leave blank if none'",
          },
        },
        required: ["key", "question", "placeholder"],
      },
    },
  },
  required: ["questions"],
} as const;
