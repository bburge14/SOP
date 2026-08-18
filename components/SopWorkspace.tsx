"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import TopicInput from "@/components/TopicInput";
import VariableForm from "@/components/VariableForm";
import MarkdownPreview, { type PreviewMode } from "@/components/MarkdownPreview";
import ActionBar from "@/components/ActionBar";
import UpdatePanel from "@/components/UpdatePanel";
import DesktopUpdatePanel from "@/components/DesktopUpdatePanel";
import DesktopSettingsPanel from "@/components/DesktopSettingsPanel";
import DesktopOnboarding from "@/components/DesktopOnboarding";
import { extractPlaceholders, renderTemplate } from "@/lib/sop/template";
import type { SopVariable, VariableValues } from "@/types/sop";

type ElectronGate = "checking" | "needs-setup" | "ready";

interface SopMeta {
  title: string;
  category: string;
  overview: string;
  prerequisites: string[];
}

function humanizeKey(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

export default function SopWorkspace() {
  const [topic, setTopic] = useState("");
  const [meta, setMeta] = useState<SopMeta | null>(null);
  const [variables, setVariables] = useState<SopVariable[]>([]);
  const [values, setValues] = useState<VariableValues>({});
  const [template, setTemplate] = useState("");
  const [customKeys, setCustomKeys] = useState<Set<string>>(new Set());
  const [previewMode, setPreviewMode] = useState<PreviewMode>("preview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  // Self-hosted (no window.electronAPI) skips straight to "ready" — this
  // gate only applies to the desktop app, which has no .env.local a
  // terminal could set up, so first-run setup has to happen in the UI.
  const [electronGate, setElectronGate] = useState<ElectronGate>("checking");

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      setElectronGate("ready");
      return;
    }
    void api.getSettings().then((s) => {
      setElectronGate(s.isConfigured ? "ready" : "needs-setup");
    });
  }, []);

  const hasSop = meta !== null;

  async function generate(newTopic: string) {
    setLoading(true);
    setError(null);
    setErrorDetail(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: newTopic }),
      });
      const data = await res.json();
      if (!res.ok) {
        // `error` is always a clean, human-readable message; `detail` (raw
        // provider response / schema-validation issues) is opt-in via the
        // "Show technical details" toggle below, never shown by default.
        setError(data.error || "Failed to generate SOP.");
        setErrorDetail(typeof data.detail === "string" ? data.detail : null);
        return;
      }

      const sop = data.sop as {
        title: string;
        category: string;
        overview: string;
        prerequisites: string[];
        variables: SopVariable[];
        template_markdown: string;
      };

      setTopic(newTopic);
      setMeta({ title: sop.title, category: sop.category, overview: sop.overview, prerequisites: sop.prerequisites });
      setVariables(sop.variables);
      setValues(Object.fromEntries(sop.variables.map((v) => [v.key, v.default])));
      setTemplate(sop.template_markdown);
      setCustomKeys(new Set());
      setPreviewMode("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error generating SOP.");
    } finally {
      setLoading(false);
    }
  }

  function handleRegenerate() {
    if (hasSop) {
      const confirmed = window.confirm("Regenerating will discard your current field values and edits. Continue?");
      if (!confirmed) return;
    }
    void generate(topic);
  }

  function handleVariableChange(key: string, value: string | number | boolean) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleRemoveField(key: string) {
    setVariables((prev) => prev.filter((v) => v.key !== key));
    setValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setCustomKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function handleAddField(variable: SopVariable) {
    setVariables((prev) => [...prev, variable]);
    setValues((prev) => ({ ...prev, [variable.key]: variable.default }));
    setCustomKeys((prev) => new Set(prev).add(variable.key));
  }

  // Keeps the form in sync when the user hand-edits {{placeholders}} in the
  // Source tab — new keys typed into the markdown get a form field without
  // a round trip to the API. Never auto-removes a declared variable, since
  // that could yank a custom field the user added but hasn't referenced yet.
  function handleTemplateChange(next: string) {
    setTemplate(next);
    const placeholders = extractPlaceholders(next);

    setVariables((prev) => {
      const existingKeys = new Set(prev.map((v) => v.key));
      const additions: SopVariable[] = placeholders
        .filter((key) => !existingKeys.has(key))
        .map((key) => ({
          key,
          label: humanizeKey(key),
          description: "Detected from a source edit.",
          default: "",
          type: "string" as const,
        }));
      return additions.length ? [...prev, ...additions] : prev;
    });

    setValues((prev) => {
      const additions: VariableValues = {};
      for (const key of placeholders) {
        if (!(key in prev)) additions[key] = "";
      }
      return Object.keys(additions).length ? { ...prev, ...additions } : prev;
    });
  }

  function handleCopy() {
    void navigator.clipboard.writeText(renderTemplate(template, values));
  }

  function handleExportMarkdown() {
    const rendered = renderTemplate(template, values);
    const blob = new Blob([rendered], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(meta?.title || topic || "sop")}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleExportPdf() {
    setPreviewMode("preview");
    // Let the preview tab paint before printing/exporting — needs a frame
    // either way, whichever path runs.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const api = window.electronAPI;
    if (api) {
      // Native path: Chromium's printToPDF straight to a file the user
      // picks, instead of routing through the OS print dialog — more
      // reliable, and it's what "Export PDF" should mean: produce a file,
      // not hand you off to a system dialog to save one yourself.
      const filename = `${slugify(meta?.title || topic || "sop")}.pdf`;
      const result = await api.exportPdf(filename);
      if (!result.ok && !result.canceled) {
        setError(result.error || "Failed to export PDF.");
      }
      return;
    }

    window.print();
  }

  if (electronGate === "checking") {
    return (
      <main className="h-screen flex items-center justify-center">
        <Loader2 className="size-6 text-slate-500 animate-spin" />
      </main>
    );
  }

  if (electronGate === "needs-setup") {
    return <DesktopOnboarding onConfigured={() => setElectronGate("ready")} />;
  }

  return (
    <main className="mx-auto max-w-7xl h-screen flex flex-col p-6 gap-5">
      <header className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed local logo, no need for next/image's optimization pipeline */}
        <img src="/logo.png" alt="" width={36} height={36} className="size-9 rounded-lg" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-white leading-none">SOP Writer</h1>
          <p className="text-xs text-slate-500 mt-0.5">Generate parameterized standard operating procedures</p>
        </div>
        <UpdatePanel />
        <DesktopUpdatePanel />
        <DesktopSettingsPanel />
      </header>

      <TopicInput onSubmit={(t) => void generate(t)} loading={loading} initialValue={topic} />

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <span>{error}</span>
            {errorDetail && (
              <details className="mt-1.5">
                <summary className="text-xs text-red-400/70 hover:text-red-300 cursor-pointer select-none">
                  Show technical details
                </summary>
                <pre className="mt-1 max-h-40 overflow-y-auto bg-black/30 border border-red-500/20 rounded p-2 text-[11px] font-mono text-red-300/80 whitespace-pre-wrap">
                  {errorDetail}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}

      {!hasSop && !loading && (
        <div className="flex-1 flex items-center justify-center text-center">
          <div className="max-w-sm">
            <p className="text-slate-400 text-sm">
              Describe a task, vendor procedure, or technology above — SOP Writer will draft a parameterized SOP you
              can fill in and export.
            </p>
          </div>
        </div>
      )}

      {hasSop && meta && (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
          <div className="flex flex-col min-h-0 gap-4 overflow-y-auto pr-1">
            <div>
              <span className="inline-block text-[11px] font-medium uppercase tracking-wide text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded px-2 py-0.5 mb-2">
                {meta.category}
              </span>
              <h2 className="text-base font-semibold text-white">{meta.title}</h2>
              <p className="text-sm text-slate-400 mt-1">{meta.overview}</p>
            </div>

            {meta.prerequisites.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Prerequisites</h3>
                <ul className="list-disc list-outside pl-4 space-y-1 text-sm text-slate-300">
                  {meta.prerequisites.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Variables</h3>
              <VariableForm
                variables={variables}
                values={values}
                customKeys={customKeys}
                onChange={handleVariableChange}
                onRemove={handleRemoveField}
              />
            </div>
          </div>

          <div className="flex flex-col min-h-0 gap-3">
            <ActionBar
              onRegenerate={handleRegenerate}
              regenerating={loading}
              disabled={loading}
              onCopy={handleCopy}
              onExportMarkdown={handleExportMarkdown}
              onExportPdf={handleExportPdf}
              existingKeys={new Set(variables.map((v) => v.key))}
              onAddField={handleAddField}
            />
            <MarkdownPreview
              template={template}
              values={values}
              onTemplateChange={handleTemplateChange}
              mode={previewMode}
              onModeChange={setPreviewMode}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
