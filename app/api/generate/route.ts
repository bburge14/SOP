import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getLlmAdapter } from "@/lib/llm";
import { SOP_SYSTEM_PROMPT, buildUserPrompt } from "@/lib/llm/prompt";
import { extractAndParseJson } from "@/lib/sop/parseJson";
import { validateAndReconcile } from "@/lib/sop/reconcile";
import { LlmAdapterError, LlmConfigError } from "@/lib/llm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let topic: unknown;
  try {
    ({ topic } = await req.json());
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

  try {
    const adapter = getLlmAdapter();
    const raw = await adapter.generate(SOP_SYSTEM_PROMPT, buildUserPrompt(topic));
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
