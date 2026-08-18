import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getLlmAdapter } from "@/lib/llm";
import { SOP_SYSTEM_PROMPT, buildUserPrompt } from "@/lib/llm/prompt";
import { extractAndParseJson } from "@/lib/sop/parseJson";
import { validateAndReconcile } from "@/lib/sop/reconcile";
import { LlmAdapterError } from "@/lib/llm/types";

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
    return NextResponse.json({ error: describeError(err) }, { status: statusFor(err) });
  }
}

function statusFor(err: unknown): number {
  if (err instanceof LlmAdapterError && err.message.includes("is not set")) return 500;
  return 502;
}

function describeError(err: unknown): string {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return `Model response didn't match the expected SOP schema: ${issues}`;
  }
  if (err instanceof LlmAdapterError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error generating SOP.";
}
