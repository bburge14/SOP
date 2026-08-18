"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Settings2 } from "lucide-react";
import type { DesktopProvider, DesktopSettings } from "@/types/electron";

const PROVIDER_NEEDS_KEY: Record<DesktopProvider, boolean> = {
  anthropic: true,
  openai: true,
  gemini: true,
  ollama: false,
};

interface DesktopSettingsPanelProps {
  onConfigured?: () => void;
}

export default function DesktopSettingsPanel({ onConfigured }: DesktopSettingsPanelProps) {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<DesktopProvider>("anthropic");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `window` doesn't exist during SSR, even for a "use client" component —
  // this only flips true after mount, so the render path never touches
  // `window` directly outside of useEffect/event handlers.
  const [hasElectronAPI, setHasElectronAPI] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    setHasElectronAPI(true);
    void api.getSettings().then((s) => {
      setSettings(s);
      setProvider(s.provider);
      setModel(s.model);
      if (!s.isConfigured) setOpen(true);
    });
  }, []);

  if (!hasElectronAPI) return null;

  async function handleSave() {
    const api = window.electronAPI;
    if (!api) return;
    if (PROVIDER_NEEDS_KEY[provider] && !apiKey.trim() && !settings?.hasApiKey) {
      setError("This provider needs an API key.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // The main process restarts the embedded server and navigates this
      // window to it once ready (electron/main.js#restartServer) — this
      // call may never resolve if the page unloads first, which is fine;
      // the reload itself is the completion signal.
      await api.saveSettings({ provider, model: model.trim(), apiKey: apiKey.trim() || undefined });
      onConfigured?.();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    }
  }

  const needsKeyNow = PROVIDER_NEEDS_KEY[provider];
  const unconfigured = settings ? !settings.isConfigured : false;

  return (
    <div className="relative text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 px-2 py-1 rounded-md transition-colors"
      >
        <Settings2 className="size-3.5" />
        {unconfigured && <span className="size-1.5 rounded-full bg-amber-400" />}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 bg-panel border border-border rounded-lg p-4 shadow-xl space-y-3">
          <h3 className="text-sm font-semibold text-white">AI Provider</h3>

          {unconfigured && (
            <div className="flex items-start gap-1.5 text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
              <span>Pick a provider and enter an API key to start generating SOPs.</span>
            </div>
          )}

          <div>
            <label className="text-slate-400 block mb-1">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as DesktopProvider)}
              className="w-full bg-canvas border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Google Gemini</option>
              <option value="ollama">Ollama (local)</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Model (optional)</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="uses a sensible default"
              className="w-full bg-canvas border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
            />
          </div>

          {needsKeyNow && (
            <div>
              <label className="text-slate-400 block mb-1">
                API Key {settings?.hasApiKey && provider === settings.provider ? "(already set — leave blank to keep it)" : ""}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="stored encrypted via your OS keychain"
                className="w-full bg-canvas border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
              />
            </div>
          )}

          {error && <p className="text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={unconfigured}
              className="text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 font-medium bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 text-white px-3 py-1.5 rounded-md transition-colors"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {saving ? "Restarting…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
