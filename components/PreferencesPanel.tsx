"use client";

import { useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useOnClickOutside } from "@/lib/hooks/useOnClickOutside";

const STORAGE_KEY = "sop-writer:hover-highlight-enabled";

/** Reads the persisted preference; defaults to enabled when unset or when localStorage isn't available (SSR). */
export function readHoverHighlightEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === "true";
}

interface PreferencesPanelProps {
  hoverHighlightEnabled: boolean;
  onHoverHighlightChange: (enabled: boolean) => void;
}

/**
 * A small always-available (self-hosted or desktop) preferences popover for
 * purely local display preferences — distinct from DesktopSettingsPanel,
 * which is Electron-only and holds the AI provider/API key. This one only
 * ever touches localStorage, never Electron IPC, so it renders identically
 * in both deployment modes.
 */
export default function PreferencesPanel({ hoverHighlightEnabled, onHoverHighlightChange }: PreferencesPanelProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(containerRef, () => setOpen(false), open);

  function handleToggle(next: boolean) {
    onHoverHighlightChange(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
  }

  return (
    <div ref={containerRef} className="relative text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Preferences"
        className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 px-2 py-1 rounded-md transition-colors"
      >
        <SlidersHorizontal className="size-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 bg-panel border border-border rounded-lg p-4 shadow-xl space-y-3">
          <h3 className="text-sm font-semibold text-white">Preferences</h3>

          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hoverHighlightEnabled}
              onChange={(e) => handleToggle(e.target.checked)}
              className="size-4 mt-0.5 rounded border-border bg-panel accent-indigo-500"
            />
            <span>
              <span className="block text-slate-200">Highlight &amp; scroll to field on hover</span>
              <span className="block text-slate-500 mt-0.5">
                Hovering a field in the left panel jumps to and highlights it in the Rendered preview. Hovering
                generated text always shows a tooltip naming its field, regardless of this setting.
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
