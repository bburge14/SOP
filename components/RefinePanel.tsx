"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MessagesSquare, ShieldAlert, X } from "lucide-react";
import { useOnClickOutside } from "@/lib/hooks/useOnClickOutside";

interface RefinePanelProps {
  open: boolean;
  onClose: () => void;
  history: string[];
  onSubmit: (instruction: string) => void;
  refining: boolean;
}

/**
 * Multi-turn "tell the AI what to change" panel — each submission sends the
 * current document plus every prior instruction in this session
 * (SopWorkspace.tsx#handleRefine, app/api/refine/route.ts), so a later
 * instruction can build on an earlier one ("also move that check before
 * the reboot step") without you having to restate context. No per-message
 * confirm dialog like Scan with AI/Review & Improve — this is meant for
 * quick back-and-forth, so the privacy notice is a standing reminder
 * instead, same pattern as TopicInput's.
 */
export default function RefinePanel({ open, onClose, history, onSubmit, refining }: RefinePanelProps) {
  const [instruction, setInstruction] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(panelRef, onClose, open && !refining);

  useEffect(() => {
    if (open) historyEndRef.current?.scrollIntoView({ block: "end" });
  }, [open, history.length]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = instruction.trim();
    if (!trimmed || refining) return;
    onSubmit(trimmed);
    setInstruction("");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-6">
      <div ref={panelRef} className="w-full max-w-xl max-h-[85vh] bg-panel border border-border rounded-xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
            <MessagesSquare className="size-4 text-indigo-400 shrink-0" />
            Refine with AI
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={refining}
            className="text-slate-500 hover:text-slate-200 disabled:opacity-40 shrink-0"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">
              Describe what you&apos;d like changed — e.g. &quot;this is for a Linux server, not Windows&quot; or &quot;add a step to
              verify DNS resolution before the restart.&quot; Each instruction builds on the ones before it.
            </p>
          ) : (
            history.map((instr, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-slate-200">{instr}</span>
              </div>
            ))
          )}
          {refining && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin shrink-0" />
              Applying…
            </div>
          )}
          <div ref={historyEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="border-t border-border p-4 space-y-2">
          <div className="flex gap-2">
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="What would you like changed?"
              disabled={refining}
              autoFocus
              className="flex-1 bg-canvas border border-border rounded-md px-3 py-2 text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={refining || !instruction.trim()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
            >
              {refining ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
            </button>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-slate-600">
            <ShieldAlert className="size-3.5 shrink-0 mt-0.5" />
            <span>
              Each instruction and the full current document are sent to your configured AI provider. Values that look like API
              keys/passwords/tokens are automatically redacted first, but that&apos;s best-effort, not a guarantee.
            </span>
          </p>
        </form>
      </div>
    </div>
  );
}
