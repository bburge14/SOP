import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getLlmAdapter } from "@/lib/llm";
import { IMPORT_ANALYSIS_SYSTEM_PROMPT, buildImportAnalysisPrompt } from "@/lib/llm/prompt";
import { extractAndParseJson } from "@/lib/sop/parseJson";
import { validateAndReconcile } from "@/lib/sop/reconcile";
import { LlmAdapterError, LlmConfigError } from "@/lib/llm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Distinct from /api/generate: this sends the FULL document content to the
// AI provider (not just a topic string), because the whole point is to have
// it read and understand the imported document. That's a deliberate,
// explicit, user-triggered exception to "only the topic is ever sent" — the
// client shows a confirmation before calling this route.
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
      { error: `Document is too large to analyze (max ${MAX_DOCUMENT_LENGTH.toLocaleString()} characters).` },
      { status: 400 }
    );
  }

  try {
    const adapter = getLlmAdapter();
    const raw = await adapter.generate(IMPORT_ANALYSIS_SYSTEM_PROMPT, buildImportAnalysisPrompt(document));
    const parsed = extractAndParseJson(raw);
    const sop = validateAndReconcile(parsed);
    return NextResponse.json({ sop });
  } catch (err) {
    console.error("[api/analyze-import]", err);
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
  return { message: "Unknown error analyzing document." };
}
