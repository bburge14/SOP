"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Loader2, Trash2, X } from "lucide-react";
import { useOnClickOutside } from "@/lib/hooks/useOnClickOutside";
import { getCategoryProfile, saveCategoryProfile, deleteCategoryProfile, normalizeCategoryKey } from "@/lib/sop/categoryProfiles";
import type { CategoryProfileDefault } from "@/types/sop";

interface CategoryProfilePanelProps {
  category: string;
  /** Proposed new/changed defaults from a just-saved SOP's field edits, pre-checked and merged into the saved list — auto-opens the panel when non-empty. */
  reviewCandidates: CategoryProfileDefault[] | null;
  onReviewCandidatesHandled: () => void;
  onSaved: () => void;
}

interface Row extends CategoryProfileDefault {
  checked: boolean;
  isNew: boolean;
}

/**
 * Trigger button + popover for the local, reusable profile of one SOP
 * category — free-text environment context fed to the AI as grounding,
 * plus a set of remembered {{key}} defaults, both scoped to `category`.
 * Nothing here calls the network; saving/deleting is a plain IndexedDB
 * write (lib/sop/categoryProfiles.ts), same guarantee as the Library.
 *
 * Trigger and popover share one ref (same pattern as AddFieldDialog) so a
 * click on the trigger while open is seen as "inside" by
 * useOnClickOutside, rather than closing-then-reopening on the same click.
 *
 * Doubles as two entry points: opened manually (no reviewCandidates) it's
 * a pure viewer/editor; auto-opened right after Save to Library with a
 * diff of changed field values, it's a "remember these?" review — either
 * way the user explicitly reviews and clicks Save before anything persists.
 */
export default function CategoryProfilePanel({
  category,
  reviewCandidates,
  onReviewCandidatesHandled,
  onSaved,
}: CategoryProfilePanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hadExisting, setHadExisting] = useState(false);
  const [context, setContext] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(containerRef, () => setOpen(false), open);

  // Auto-open right after Save to Library proposes remembering some
  // changed field values for this category.
  useEffect(() => {
    if (reviewCandidates && reviewCandidates.length > 0) setOpen(true);
  }, [reviewCandidates]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getCategoryProfile(category).then((profile) => {
      if (cancelled) return;
      setHadExisting(!!profile);
      setContext(profile?.context ?? "");
      // Candidates override an existing default for the same key (the
      // user's latest edit is fresher ground truth than what's saved);
      // `isNew` drives the amber dot marking what's actually changing.
      const merged = new Map<string, Row>();
      for (const d of profile?.defaults ?? []) merged.set(d.key, { ...d, checked: true, isNew: false });
      for (const c of reviewCandidates ?? []) {
        const prior = merged.get(c.key);
        const changed = !prior || String(prior.value) !== String(c.value);
        merged.set(c.key, { ...c, checked: true, isNew: changed });
      }
      setRows(Array.from(merged.values()));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // reviewCandidates is a fresh array every render by construction
    // (computed in the parent from a diff) — only re-load when the panel
    // opens or the category changes, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  function close() {
    setOpen(false);
    onReviewCandidatesHandled();
  }

  function toggleRow(key: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, checked: !r.checked } : r)));
  }

  function updateRowValue(key: string, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, value } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const defaults: CategoryProfileDefault[] = rows
        .filter((r) => r.checked)
        .map(({ key, label, value, type }) => ({ key, label, value, type }));
      await saveCategoryProfile({
        categoryKey: normalizeCategoryKey(category),
        category,
        context,
        defaults,
        updatedAt: new Date().toISOString(),
      });
      onSaved();
      close();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(`Delete the saved profile for "${category}"? This removes its context and remembered defaults.`);
    if (!confirmed) return;
    setSaving(true);
    try {
      await deleteCategoryProfile(category);
      onSaved();
      close();
    } finally {
      setSaving(false);
    }
  }

  const disabled = !category.trim();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title={disabled ? "Type a category above to view/edit its saved profile" : `View/edit the saved profile for "${category}"`}
        className="flex items-center justify-center size-9 shrink-0 rounded-lg border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <BookOpen className="size-4" />
      </button>

      {open && !disabled && (
        // A plain div, not <form> — this panel is rendered inside
        // TopicInput's own <form>, and a nested <form> is invalid HTML: the
        // inner submit bubbled up and triggered the outer form's native
        // submit (a full page navigation, wiping all React state).
        // Reproduced live with Playwright before fixing.
        <div className="absolute z-20 top-full left-0 mt-2 w-96 bg-panel border border-border rounded-lg p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white truncate pr-2">Category profile: {category}</h3>
            <button type="button" onClick={close} className="text-slate-500 hover:text-slate-200 shrink-0" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
              <Loader2 className="size-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Environment context — sent to the AI as grounding whenever you generate an SOP in this category
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={3}
                  placeholder='e.g. "AD domain is corp.example.com. Ticketing system is Jira. Standard management VLAN is 10."'
                  className="w-full bg-canvas border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60 resize-none"
                />
              </div>

              {rows.length > 0 && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Remembered field defaults</label>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {rows.map((row) => (
                      <div key={row.key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={row.checked}
                          onChange={() => toggleRow(row.key)}
                          className="size-3.5 rounded border-border bg-panel accent-indigo-500 shrink-0"
                        />
                        <span className="text-xs text-slate-300 truncate shrink-0 w-28" title={row.label}>
                          {row.label}
                          {row.isNew && (
                            <span className="text-amber-400" title="New or changed since this profile was last saved">
                              {" "}
                              •
                            </span>
                          )}
                        </span>
                        <input
                          value={String(row.value)}
                          onChange={(e) => updateRowValue(row.key, e.target.value)}
                          className="flex-1 min-w-0 bg-canvas border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                        />
                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          className="text-slate-500 hover:text-red-400 shrink-0"
                          aria-label={`Remove ${row.key}`}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                {hadExisting ? (
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={saving}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
                  >
                    <Trash2 className="size-3.5" />
                    Delete profile
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={close} className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 text-white px-3 py-1.5 rounded-md"
                  >
                    Save profile
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
