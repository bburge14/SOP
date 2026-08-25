"use client";

import { FormEvent, useRef, useState } from "react";
import { Split } from "lucide-react";
import type { SopVariable } from "@/types/sop";
import { useOnClickOutside } from "@/lib/hooks/useOnClickOutside";

const KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

interface SplitOccurrencePopoverProps {
  /** Viewport-relative rect of the clicked chip, from VariableChipWidget's click handler — used to position this popover with `position: fixed`. */
  anchorRect: DOMRect;
  originalKey: string;
  originalLabel: string;
  /** Every other declared field this occurrence could be reassigned to. */
  otherVariables: SopVariable[];
  existingKeys: Set<string>;
  onClose: () => void;
  onReassign: (targetKey: string) => void;
  onCreateNew: (newKey: string, newLabel: string) => void;
}

function suggestKey(base: string, existingKeys: Set<string>): string {
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!existingKeys.has(candidate)) return candidate;
  }
}

/**
 * Opened by clicking a {{key}} chip in the live editor — a chip is atomic
 * (not editable in place) and had no other click behavior, so this reuses
 * that gesture rather than adding a new one. Lets you decouple ONE specific
 * occurrence of a reused variable: point it at a different existing field,
 * or split it off into a brand-new field seeded with the same current value
 * (so the document renders identically right after the split — only future
 * edits to either field diverge).
 */
export default function SplitOccurrencePopover({
  anchorRect,
  originalKey,
  originalLabel,
  otherVariables,
  existingKeys,
  onClose,
  onReassign,
  onCreateNew,
}: SplitOccurrencePopoverProps) {
  const [reassignTarget, setReassignTarget] = useState(otherVariables[0]?.key ?? "");
  const [newKey, setNewKey] = useState(() => suggestKey(originalKey, existingKeys));
  const [newLabel, setNewLabel] = useState(`${originalLabel} (2)`);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(containerRef, onClose, true);

  function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedKey = newKey.trim();
    if (!KEY_RE.test(trimmedKey)) {
      setError("Key must be a valid identifier, e.g. server_host_2.");
      return;
    }
    if (existingKeys.has(trimmedKey)) {
      setError("A field with that key already exists.");
      return;
    }
    onCreateNew(trimmedKey, newLabel.trim() || trimmedKey);
  }

  // position: fixed with viewport coordinates from getBoundingClientRect —
  // no container-relative math needed, and it stays correctly placed
  // regardless of which scroll container the chip lives in.
  const top = anchorRect.bottom + 6;
  const left = Math.min(anchorRect.left, window.innerWidth - 336);

  return (
    <div
      ref={containerRef}
      style={{ position: "fixed", top, left }}
      className="z-30 w-80 bg-panel border border-border rounded-lg p-4 shadow-2xl space-y-3"
    >
      <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
        <Split className="size-3.5 text-indigo-400" />
        This occurrence of {`{{${originalKey}}}`}
      </h3>

      {otherVariables.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs text-slate-400 block">Reassign to an existing field</label>
          <div className="flex gap-2">
            <select
              value={reassignTarget}
              onChange={(e) => setReassignTarget(e.target.value)}
              className="flex-1 bg-canvas border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
            >
              {otherVariables.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label} ({`{{${v.key}}}`})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => reassignTarget && onReassign(reassignTarget)}
              disabled={!reassignTarget}
              className="text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-md shrink-0"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-border pt-3">
        <p className="text-xs text-slate-400 mb-2">Or split it off into a new field</p>
        <form onSubmit={handleCreateSubmit} className="space-y-2">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Key</label>
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="w-full bg-canvas border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Label</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-full bg-canvas border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5">
              Cancel
            </button>
            <button
              type="submit"
              className="text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md"
            >
              Create Field
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
