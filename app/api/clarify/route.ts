import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getLlmAdapter } from "@/lib/llm";
import { CLARIFYING_QUESTIONS_SYSTEM_PROMPT, buildClarifyingQuestionsPrompt } from "@/lib/llm/prompt";
import { clarifyingQuestionsJsonSchema, clarifyingQuestionsZodSchema } from "@/lib/llm/schema";
import { extractAndParseJson } from "@/lib/sop/parseJson";
import { LlmAdapterError, LlmConfigError } from "@/lib/llm/types";
import { MAX_CONTEXT_FILES, MAX_CONTEXT_TOTAL_CHARS } from "@/lib/sop/contextLimits";
import type { ContextAttachment } from "@/types/sop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let topic: unknown;
  let context: unknown;
  try {
    ({ topic, context } = await req.json());
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

  try {
    const adapter = getLlmAdapter();
    const raw = await adapter.generate(
      CLARIFYING_QUESTIONS_SYSTEM_PROMPT,
      buildClarifyingQuestionsPrompt(topic, contextAttachments),
      clarifyingQuestionsJsonSchema
    );
    const parsed = extractAndParseJson(raw);
    const { questions } = clarifyingQuestionsZodSchema.parse(parsed);
    return NextResponse.json({ questions });
  } catch (err) {
    console.error("[api/clarify]", err);
    const { message, detail } = describeError(err);
    return NextResponse.json({ error: message, detail }, { status: statusFor(err) });
  }
}

// Same validation as /api/generate's `context` field — duplicated rather
// than shared, matching the existing convention across these routes.
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

function statusFor(err: unknown): number {
  if (err instanceof LlmConfigError) return 500;
  return 502;
}

function describeError(err: unknown): { message: string; detail?: string } {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return {
      message: "The AI's response wasn't formatted correctly. This is usually temporary — try again.",
      detail: issues,
    };
  }
  if (err instanceof LlmAdapterError) {
    return { message: err.message, detail: typeof err.cause === "string" ? err.cause : undefined };
  }
  if (err instanceof Error) {
    return { message: err.message };
  }
  return { message: "Unknown error generating clarifying questions." };
}
