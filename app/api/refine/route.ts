import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getLlmAdapter } from "@/lib/llm";
import { REFINE_SYSTEM_PROMPT, buildRefinePrompt } from "@/lib/llm/prompt";
import { extractAndParseJson } from "@/lib/sop/parseJson";
import { validateAndReconcile } from "@/lib/sop/reconcile";
import { sopJsonSchema } from "@/lib/llm/schema";
import { LlmAdapterError, LlmConfigError } from "@/lib/llm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same deliberate exception as /api/review-improve: sends the FULL
// document, not just a topic, every single turn — the client shows a
// standing privacy notice in RefinePanel.tsx rather than a confirm per
// message, since this is meant to support quick back-and-forth iteration.
const MAX_DOCUMENT_LENGTH = 60_000;
const MAX_INSTRUCTION_LENGTH = 2000;
const MAX_INSTRUCTIONS = 20;

export async function POST(req: NextRequest) {
  let document: unknown;
  let instructions: unknown;
  let newInstruction: unknown;
  try {
    ({ document, instructions, newInstruction } = await req.json());
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (typeof document !== "string" || document.trim().length < 3) {
    return NextResponse.json({ error: "`document` must be a non-empty string." }, { status: 400 });
  }
  if (document.length > MAX_DOCUMENT_LENGTH) {
    return NextResponse.json(
      { error: `Document is too large to refine (max ${MAX_DOCUMENT_LENGTH.toLocaleString()} characters).` },
      { status: 400 }
    );
  }

  if (typeof newInstruction !== "string" || newInstruction.trim().length < 2) {
    return NextResponse.json({ error: "`newInstruction` must be a non-empty string." }, { status: 400 });
  }
  if (newInstruction.length > MAX_INSTRUCTION_LENGTH) {
    return NextResponse.json(
      { error: `Instruction must be ${MAX_INSTRUCTION_LENGTH.toLocaleString()} characters or fewer.` },
      { status: 400 }
    );
  }

  const validatedInstructions = validateInstructions(instructions);
  if (validatedInstructions instanceof NextResponse) return validatedInstructions;

  try {
    const adapter = getLlmAdapter();
    const raw = await adapter.generate(
      REFINE_SYSTEM_PROMPT,
      buildRefinePrompt(document, validatedInstructions, newInstruction),
      sopJsonSchema
    );
    const parsed = extractAndParseJson(raw);
    const sop = validateAndReconcile(parsed);
    return NextResponse.json({ sop });
  } catch (err) {
    console.error("[api/refine]", err);
    const { message, detail } = describeError(err);
    return NextResponse.json({ error: message, detail }, { status: statusFor(err) });
  }
}

/** Returns the validated prior-instruction strings, or a ready-to-return 400 response on bad input. */
function validateInstructions(instructions: unknown): string[] | NextResponse {
  if (instructions === undefined || instructions === null) return [];
  if (!Array.isArray(instructions) || !instructions.every((i) => typeof i === "string")) {
    return NextResponse.json({ error: "`instructions` must be an array of strings." }, { status: 400 });
  }
  // Cap to the most recent N rather than reject outright — a long-running
  // refine session should keep working, just with older instructions
  // dropped from context (the document itself already reflects them).
  return (instructions as string[]).slice(-MAX_INSTRUCTIONS);
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
  return { message: "Unknown error refining SOP." };
}
