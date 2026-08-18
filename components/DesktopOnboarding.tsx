"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import type { DesktopProvider } from "@/types/electron";
import { PROVIDER_INFO } from "@/lib/providerInfo";
import { DEFAULT_GEMINI_MODEL, DEFAULT_OPENAI_MODEL } from "@/lib/llm/modelOptions";
import ModelSelect from "@/components/ModelSelect";

const PROVIDER_NEEDS_KEY: Record<DesktopProvider, boolean> = {
  openai: true,
  gemini: true,
  ollama: false,
};

const RECOMMENDED_MODEL: Record<DesktopProvider, string> = {
  gemini: DEFAULT_GEMINI_MODEL,
  openai: DEFAULT_OPENAI_MODEL,
  ollama: "",
};

interface DesktopOnboardingProps {
  onConfigured: () => void;
}

/**
 * Full-screen, blocking setup gate shown on first launch before any part
 * of the app is usable — SopWorkspace renders only this until
 * window.electronAPI.getSettings().isConfigured is true. Deliberately not
 * dismissible: generating an SOP always requires querying some LLM, so
 * skipping this just defers the same requirement to a confusing error
 * later. The header's gear-icon panel (DesktopSettingsPanel) remains
 * available afterward for changing providers.
 */
export default function DesktopOnboarding({ onConfigured }: DesktopOnboardingProps) {
  const [provider, setProvider] = useState<DesktopProvider>("gemini");
  const [model, setModel] = useState(RECOMMENDED_MODEL.gemini);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsKey = PROVIDER_NEEDS_KEY[provider];
  const info = PROVIDER_INFO[provider];

  function handleProviderChange(next: DesktopProvider) {
    setProvider(next);
    setModel(RECOMMENDED_MODEL[next]);
    setError(null);
  }

  async function handleSubmit() {
    const api = window.electronAPI;
    if (!api) return;
    if (needsKey && !apiKey.trim()) {
      setError("This provider needs an API key — see the link above to get one.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Saving restarts the embedded server and reloads this window once
      // it's back up (electron/main.js#restartServer) — this call may
      // never resolve if the page unloads first, which is fine; the
      // reload re-mounts SopWorkspace, which re-checks settings and finds
      // isConfigured now true.
      await api.saveSettings({ provider, model: model.trim(), apiKey: apiKey.trim() || undefined });
      onConfigured();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-panel border border-border rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-9 rounded-lg bg-indigo-600/20 border border-indigo-500/30">
            <FileText className="size-4.5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white leading-none">Welcome to SOP Writer</h1>
            <p className="text-xs text-slate-500 mt-0.5">One-time setup before you can generate SOPs</p>
          </div>
        </div>

        <p className="text-sm text-slate-400">
          Generating an SOP means asking an AI model to write it, so SOP Writer needs to know which one to use.
          Pick a provider below — this only takes a minute.
        </p>

        <div>
          <label className="text-xs text-slate-400 block mb-1">Provider</label>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as DesktopProvider)}
            className="w-full bg-canvas border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="ollama">Ollama (local)</option>
          </select>
          <p className="text-xs text-slate-500 mt-1.5">{info.blurb}</p>
          <a
            href={info.linkUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2 mt-1 inline-block"
          >
            {info.linkLabel}
          </a>
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-1">Model</label>
          <ModelSelect provider={provider} value={model} onChange={setModel} />
        </div>

        {needsKey && (
          <div>
            <label className="text-xs text-slate-400 block mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="stored encrypted via your OS keychain"
              className="w-full bg-canvas border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
              autoFocus
            />
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          {saving ? "Starting up…" : "Get Started"}
        </button>

        <p className="text-xs text-slate-600 text-center">You can change this later from the gear icon in the header.</p>
      </div>
    </main>
  );
}
