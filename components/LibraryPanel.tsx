"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Loader2, Search, Trash2, X } from "lucide-react";
import { deleteSopFromLibrary, listSavedSops } from "@/lib/sop/library";
import { useOnClickOutside } from "@/lib/hooks/useOnClickOutside";
import type { SavedSop } from "@/types/sop";

interface LibraryPanelProps {
  open: boolean;
  onClose: () => void;
  onLoad: (sop: SavedSop) => void;
}

/**
 * Browses the local SOP library (IndexedDB, see lib/sop/library.ts). Purely
 * local: opening this panel, filtering, and deleting never touch the
 * network. Loading a record calls `onLoad`, which just populates the
 * workspace's normal state — the same thing Import already does — so
 * nothing here reaches the AI on its own.
 */
export default function LibraryPanel({ open, onClose, onLoad }: LibraryPanelProps) {
  const [sops, setSops] = useState<SavedSop[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const panelRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(panelRef, onClose, open);

  useEffect(() => {
    if (!open) return;
    setLoadingList(true);
    listSavedSops()
      .then(setSops)
      .finally(() => setLoadingList(false));
  }, [open]);

  const categories = useMemo(() => {
    const set = new Set(sops.map((s) => s.category || "Uncategorized"));
    return ["All", ...Array.from(set).sort()];
  }, [sops]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sops.filter((s) => {
      const matchesCategory = category === "All" || (s.category || "Uncategorized") === category;
      const matchesSearch = !q || s.title.toLowerCase().includes(q) || s.overview.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [sops, search, category]);

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Delete this SOP from the library? This can't be undone.");
    if (!confirmed) return;
    await deleteSopFromLibrary(id);
    setSops((prev) => prev.filter((s) => s.id !== id));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 bg-black/60 flex items-center justify-center p-6">
      <div ref={panelRef} className="w-full max-w-2xl max-h-[80vh] bg-panel border border-border rounded-xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-white">SOP Library</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Saved locally on this device only — loading one doesn&apos;t send anything anywhere.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1" aria-label="Close library">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <div className="relative flex-1">
            <Search className="size-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search saved SOPs…"
              className="w-full bg-canvas border border-border rounded-md pl-8 pr-3 py-1.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-canvas border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {loadingList ? (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              {sops.length === 0 ? "No saved SOPs yet — use “Save to Library” to keep one here." : "No matches."}
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((sop) => (
                <li
                  key={sop.id}
                  className="flex items-start gap-3 bg-canvas border border-border rounded-lg p-3 hover:border-slate-500 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded px-1.5 py-0.5">
                        {sop.category || "Uncategorized"}
                      </span>
                      <span className="text-xs text-slate-500">{formatRelativeTime(sop.updatedAt)}</span>
                    </div>
                    <h3 className="text-sm font-medium text-white mt-1 truncate">{sop.title}</h3>
                    {sop.overview && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{sop.overview}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onLoad(sop)}
                      title="Load into the workspace"
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                    >
                      <FolderOpen className="size-3.5" />
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(sop.id)}
                      title="Delete"
                      className="text-slate-500 hover:text-red-400 p-1.5"
                      aria-label={`Delete ${sop.title}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSeconds = Math.round((Date.now() - then) / 1000);
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString();
}
