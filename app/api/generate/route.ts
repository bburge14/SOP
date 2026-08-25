import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getLlmAdapter } from "@/lib/llm";
import { SOP_SYSTEM_PROMPT, buildUserPrompt } from "@/lib/llm/prompt";
import { extractAndParseJson } from "@/lib/sop/parseJson";
import { validateAndReconcile } from "@/lib/sop/reconcile";
import { sopJsonSchema } from "@/lib/llm/schema";
import { LlmAdapterError, LlmConfigError } from "@/lib/llm/types";
import { MAX_CONTEXT_FILES, MAX_CONTEXT_TOTAL_CHARS } from "@/lib/sop/contextLimits";
import type { ContextAttachment } from "@/types/sop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CATEGORY_CONTEXT_CHARS = 5000;
const MAX_CLARIFICATIONS = 8;
const MAX_CLARIFICATION_ANSWER_CHARS = 1000;
const MAX_DRAFT_STEPS_CHARS = 20000;

export async function POST(req: NextRequest) {
  let topic: unknown;
  let context: unknown;
  let categoryProfile: unknown;
  let clarifications: unknown;
  let draftSteps: unknown;
  try {
    ({ topic, context, categoryProfile, clarifications, draftSteps } = await req.json());
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (typeof topic !== "string" || topic.trim().length < 3) {
    return NextResponse.json(
      { error: "`topic` must be a non-empty string describing the task or technology." },
      { status: 400 }
    );
  }
  if (topic.length > 500) {
    return NextResponse.json({ error: "`topic` must be 500 characters or fewer." }, { status: 400 });
  }

  const contextAttachments = validateContext(context);
  if (contextAttachments instanceof NextResponse) return contextAttachments;

  const validatedCategoryProfile = validateCategoryProfile(categoryProfile);
  if (validatedCategoryProfile instanceof NextResponse) return validatedCategoryProfile;

  const validatedClarifications = validateClarifications(clarifications);
  if (validatedClarifications instanceof NextResponse) return validatedClarifications;

  const validatedDraftSteps = validateDraftSteps(draftSteps);
  if (validatedDraftSteps instanceof NextResponse) return validatedDraftSteps;

  try {
    const adapter = getLlmAdapter();
    const raw = await adapter.generate(
      SOP_SYSTEM_PROMPT,
      buildUserPrompt(topic, contextAttachments, validatedCategoryProfile, validatedClarifications, validatedDraftSteps),
      sopJsonSchema
    );
    const parsed = extractAndParseJson(raw);
    const sop = validateAndReconcile(parsed);
    return NextResponse.json({ sop });
  } catch (err) {
    // Full technical detail goes to the server log — never lost, just not
    // dumped raw into the error banner (reported live: a Gemini 503 body
    // rendered verbatim in the UI). The client gets a clean message plus
    // an optional `detail` string for an opt-in "show technical details."
    console.error("[api/generate]", err);
    const { message, detail } = describeError(err);
    return NextResponse.json({ error: message, detail }, { status: statusFor(err) });
  }
}

/** Returns the validated attachments, or a ready-to-return 400 response on bad input. */
function validateContext(context: unknown): ContextAttachment[] | NextResponse {
  if (context === undefined || context === null) return [];

  if (!Array.isArray(context)) {
    return NextResponse.json({ error: "`context` must be an array of { name, content } files." }, { status: 400 });
  }
  if (context.length > MAX_CONTEXT_FILES) {
    return NextResponse.json(
      { error: `At most ${MAX_CONTEXT_FILES} reference files can be attached.` },
      { status: 400 }
    );
  }

  let total = 0;
  for (const item of context) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).name !== "string" ||
      typeof (item as Record<string, unknown>).content !== "string"
    ) {
      return NextResponse.json(
        { error: "Each context file must be an object with a string `name` and `content`." },
        { status: 400 }
      );
    }
    total += (item as ContextAttachment).content.length;
  }
  if (total > MAX_CONTEXT_TOTAL_CHARS) {
    return NextResponse.json(
      { error: `Attached reference files total ${MAX_CONTEXT_TOTAL_CHARS.toLocaleString()} characters or fewer.` },
      { status: 400 }
    );
  }

  return context as ContextAttachment[];
}

/** Returns the validated { category, context } pair, undefined if omitted, or a ready-to-return 400 response on bad input. */
function validateCategoryProfile(categoryProfile: unknown): { category: string; context: string } | undefined | NextResponse {
  if (categoryProfile === undefined || categoryProfile === null) return undefined;

  if (
    typeof categoryProfile !== "object" ||
    typeof (categoryProfile as Record<string, unknown>).category !== "string" ||
    typeof (categoryProfile as Record<string, unknown>).context !== "string"
  ) {
    return NextResponse.json(
      { error: "`categoryProfile` must be an object with string `category` and `context`." },
      { status: 400 }
    );
  }
  const { category, context } = categoryProfile as { category: string; context: string };
  if (!category.trim()) return undefined;
  if (context.length > MAX_CATEGORY_CONTEXT_CHARS) {
    return NextResponse.json(
      { error: `Category profile context must be ${MAX_CATEGORY_CONTEXT_CHARS.toLocaleString()} characters or fewer.` },
      { status: 400 }
    );
  }
  return { category: category.trim(), context };
}

/** Returns the validated { question, answer } pairs, undefined if omitted, or a ready-to-return 400 response on bad input. */
function validateClarifications(
  clarifications: unknown
): { question: string; answer: string }[] | undefined | NextResponse {
  if (clarifications === undefined || clarifications === null) return undefined;

  if (!Array.isArray(clarifications)) {
    return NextResponse.json(
      { error: "`clarifications` must be an array of { question, answer } pairs." },
      { status: 400 }
    );
  }
  if (clarifications.length > MAX_CLARIFICATIONS) {
    return NextResponse.json({ error: `At most ${MAX_CLARIFICATIONS} clarifying answers are allowed.` }, { status: 400 });
  }

  const validated: { question: string; answer: string }[] = [];
  for (const item of clarifications) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).question !== "string" ||
      typeof (item as Record<string, unknown>).answer !== "string"
    ) {
      return NextResponse.json(
        { error: "Each clarification must be an object with a string `question` and `answer`." },
        { status: 400 }
      );
    }
    const { question, answer } = item as { question: string; answer: string };
    if (answer.length > MAX_CLARIFICATION_ANSWER_CHARS) {
      return NextResponse.json(
        { error: `Each clarification answer must be ${MAX_CLARIFICATION_ANSWER_CHARS.toLocaleString()} characters or fewer.` },
        { status: 400 }
      );
    }
    validated.push({ question, answer });
  }
  return validated;
}

/** Returns the validated draft-steps string, undefined if omitted, or a ready-to-return 400 response on bad input. */
function validateDraftSteps(draftSteps: unknown): string | undefined | NextResponse {
  if (draftSteps === undefined || draftSteps === null) return undefined;
  if (typeof draftSteps !== "string") {
    return NextResponse.json({ error: "`draftSteps` must be a string." }, { status: 400 });
  }
  if (!draftSteps.trim()) return undefined;
  if (draftSteps.length > MAX_DRAFT_STEPS_CHARS) {
    return NextResponse.json(
      { error: `Draft steps must be ${MAX_DRAFT_STEPS_CHARS.toLocaleString()} characters or fewer.` },
      { status: 400 }
    );
  }
  return draftSteps;
}

function statusFor(err: unknown): number {
  // Not configured (500, fix it in Settings) is distinct from the
  // provider's own request failing (502, possibly transient) — checked by
  // type, not by matching message text, which silently broke once already
  // when the wording changed but a string check on it didn't.
  if (err instanceof LlmConfigError) return 500;
  return 502;
}

function describeError(err: unknown): { message: string; detail?: string } {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return {
      message: "The AI's response wasn't formatted correctly. This is usually temporary — try regenerating.",
      detail: issues,
    };
  }
  if (err instanceof LlmAdapterError) {
    return { message: err.message, detail: typeof err.cause === "string" ? err.cause : undefined };
  }
  if (err instanceof Error) {
    return { message: err.message };
  }
  return { message: "Unknown error generating SOP." };
}
