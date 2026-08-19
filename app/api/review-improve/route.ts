import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getLlmAdapter } from "@/lib/llm";
import { REVIEW_IMPROVE_SYSTEM_PROMPT, buildReviewImprovePrompt } from "@/lib/llm/prompt";
import { extractAndParseJson } from "@/lib/sop/parseJson";
import { validateAndReconcile } from "@/lib/sop/reconcile";
import { sopJsonSchema } from "@/lib/llm/schema";
import { LlmAdapterError, LlmConfigError } from "@/lib/llm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same deliberate exception as /api/analyze-import: sends the FULL document,
// not just a topic, since the whole point is having the AI read and improve
// it. The client shows a confirmation before calling this route.
const MAX_DOCUMENT_LENGTH = 60_000;

export async function POST(req: NextRequest) {
  let document: unknown;
  try {
    ({ document } = await req.json());
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (typeof document !== "string" || document.trim().length < 3) {
    return NextResponse.json({ error: "`document` must be a non-empty string." }, { status: 400 });
  }
  if (document.length > MAX_DOCUMENT_LENGTH) {
    return NextResponse.json(
      { error: `Document is too large to review (max ${MAX_DOCUMENT_LENGTH.toLocaleString()} characters).` },
      { status: 400 }
    );
  }

  try {
    const adapter = getLlmAdapter();
    const raw = await adapter.generate(REVIEW_IMPROVE_SYSTEM_PROMPT, buildReviewImprovePrompt(document), sopJsonSchema);
    const parsed = extractAndParseJson(raw);
    const sop = validateAndReconcile(parsed);
    return NextResponse.json({ sop });
  } catch (err) {
    console.error("[api/review-improve]", err);
    const { message, detail } = describeError(err);
    return NextResponse.json({ error: message, detail }, { status: statusFor(err) });
  }
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
  return { message: "Unknown error reviewing document." };
}
