import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getLlmAdapter } from "@/lib/llm";
import { SUGGEST_IDEAS_SYSTEM_PROMPT, buildSuggestIdeasPrompt } from "@/lib/llm/prompt";
import { sopIdeasJsonSchema, sopIdeasZodSchema } from "@/lib/llm/schema";
import { extractAndParseJson } from "@/lib/sop/parseJson";
import { LlmAdapterError, LlmConfigError } from "@/lib/llm/types";
import { MAX_CONTEXT_FILES, MAX_CONTEXT_TOTAL_CHARS } from "@/lib/sop/contextLimits";
import type { ContextAttachment } from "@/types/sop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let context: unknown;
  try {
    ({ context } = await req.json());
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const contextAttachments = validateContext(context);
  if (contextAttachments instanceof NextResponse) return contextAttachments;
  if (contextAttachments.length === 0) {
    return NextResponse.json({ error: "Attach at least one reference file to suggest ideas from." }, { status: 400 });
  }

  try {
    const adapter = getLlmAdapter();
    const raw = await adapter.generate(
      SUGGEST_IDEAS_SYSTEM_PROMPT,
      buildSuggestIdeasPrompt(contextAttachments),
      sopIdeasJsonSchema
    );
    const parsed = extractAndParseJson(raw);
    const { ideas } = sopIdeasZodSchema.parse(parsed);
    return NextResponse.json({ ideas });
  } catch (err) {
    console.error("[api/suggest-ideas]", err);
    const { message, detail } = describeError(err);
    return NextResponse.json({ error: message, detail }, { status: statusFor(err) });
  }
}

// Same validation as /api/generate's `context` field — duplicated rather
// than shared, since the two routes' surrounding logic differs enough
// (context is optional there, required here) that a shared helper would
// need its own parameters for that difference anyway.
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
  return { message: "Unknown error suggesting SOP ideas." };
}
