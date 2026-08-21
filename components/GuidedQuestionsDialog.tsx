"use client";

import { useRef, useState } from "react";
import { Loader2, MessageCircleQuestion, X } from "lucide-react";
import { useOnClickOutside } from "@/lib/hooks/useOnClickOutside";
import type { ClarifyingQuestion } from "@/types/sop";

interface GuidedQuestionsDialogProps {
  topic: string;
  questions: ClarifyingQuestion[];
  /** True while the subsequent generate() call (Submit or Skip) is in flight — disables inputs, keeps the dialog from being dismissed mid-request. */
  submitting: boolean;
  onSubmit: (answers: { question: string; answer: string }[]) => void;
  onSkip: () => void;
  onClose: () => void;
}

/**
 * "Guided" generation's clarifying-questions step — asked before the real
 * generation call for someone who has a rough topic but doesn't know what
 * specifics turn it into a real, concrete SOP (vendor, environment,
 * existing conventions). Answers are appended to the normal generate()
 * call as grounding; nothing here is itself the SOP.
 */
export default function GuidedQuestionsDialog({ topic, questions, submitting, onSubmit, onSkip, onClose }: GuidedQuestionsDialogProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(panelRef, onClose, !submitting);

  function handleSubmit() {
    onSubmit(questions.map((q) => ({ question: q.question, answer: (answers[q.key] ?? "").trim() })));
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-6">
      <div ref={panelRef} className="w-full max-w-xl max-h-[85vh] bg-panel border border-border rounded-xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <MessageCircleQuestion className="size-4 text-indigo-400 shrink-0" />
              A few questions before generating
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate" title={topic}>
              {topic}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-slate-500 hover:text-slate-200 disabled:opacity-40 shrink-0"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {questions.map((q) => (
            <div key={q.key}>
              <label htmlFor={`guided-${q.key}`} className="text-sm text-slate-200 block mb-1">
                {q.question}
              </label>
              <input
                id={`guided-${q.key}`}
                value={answers[q.key] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
                placeholder={q.placeholder}
                disabled={submitting}
                className="w-full bg-canvas border border-border rounded-md px-3 py-2 text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 disabled:opacity-60"
              />
            </div>
          ))}
          <p className="text-xs text-slate-600">Leave anything blank you&apos;re not sure about — it won&apos;t be used.</p>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <button
            type="button"
            onClick={onSkip}
            disabled={submitting}
            className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40"
          >
            Skip &amp; generate now
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitting ? "Generating…" : "Generate SOP"}
          </button>
        </div>
      </div>
    </div>
  );
}
