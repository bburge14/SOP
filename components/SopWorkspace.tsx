"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Library as LibraryIcon, Loader2, Save } from "lucide-react";
import TopicInput from "@/components/TopicInput";
import VariableForm from "@/components/VariableForm";
import MarkdownPreview, { type PreviewMode } from "@/components/MarkdownPreview";
import ActionBar from "@/components/ActionBar";
import UpdatePanel from "@/components/UpdatePanel";
import DesktopUpdatePanel from "@/components/DesktopUpdatePanel";
import DesktopSettingsPanel from "@/components/DesktopSettingsPanel";
import PreferencesPanel, { readHoverHighlightEnabled } from "@/components/PreferencesPanel";
import DesktopOnboarding from "@/components/DesktopOnboarding";
import LibraryPanel from "@/components/LibraryPanel";
import { extractPlaceholders, renderTemplate } from "@/lib/sop/template";
import { markdownToDocxBlob } from "@/lib/sop/markdownToDocx";
import { readFileAsText } from "@/lib/sop/readFileAsText";
import { detectAndTemplatizeVariables } from "@/lib/sop/detectVariables";
import { MAX_CONTEXT_FILES, MAX_CONTEXT_TOTAL_CHARS } from "@/lib/sop/contextLimits";
import { redactSecrets } from "@/lib/sop/redactSecrets";
import { listSavedSops, saveSopToLibrary } from "@/lib/sop/library";
import type { ContextAttachment, SavedSop, SopIdea, SopVariable, VariableValues } from "@/types/sop";

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
  const [exportingDocx, setExportingDocx] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [improving, setImproving] = useState(false);
  // Set when the current document was loaded from (or just saved to) the
  // library, so a subsequent Save updates that same record instead of
  // creating a duplicate. Cleared by any action that replaces the whole
  // document (Generate, Regenerate, Import, Start Blank) — those already
  // confirm "this discards your current edits", and re-linking to the old
  // library entry after a full replacement would risk a surprise overwrite
  // on the next save. AI-assisted *edits* to the same document (Scan with
  // AI, Review & Improve) keep it, since they're editing in place.
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestedIdeas, setSuggestedIdeas] = useState<SopIdea[] | null>(null);
  const [suggestingIdeas, setSuggestingIdeas] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  // Defaults true (matches readHoverHighlightEnabled's own default) and only
  // reads the real localStorage value in an effect — same "don't touch
  // window during the initial render" caution DesktopSettingsPanel already
  // uses for window.electronAPI, to avoid an SSR/client hydration mismatch.
  const [hoverHighlightEnabled, setHoverHighlightEnabled] = useState(true);
  useEffect(() => setHoverHighlightEnabled(readHoverHighlightEnabled()), []);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [contextFiles, setContextFiles] = useState<ContextAttachment[]>([]);
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
      // contextFiles are already redacted at attach time (handleAddContextFiles) —
      // only the topic still needs it here, in case a secret got pasted into it directly.
      const { text: redactedTopic } = redactSecrets(newTopic);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: redactedTopic, context: contextFiles }),
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
      setLibraryId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error generating SOP.");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(file: File) {
    if (hasSop) {
      const confirmed = window.confirm("Importing will discard your current field values and edits. Continue?");
      if (!confirmed) return;
    }

    const isDocx =
      /\.docx$/i.test(file.name) ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    let text: string;
    try {
      text = await readFileAsText(file);
    } catch {
      setError(isDocx ? "Could not read that .docx file. Is it a valid Word document?" : "Could not read that file.");
      return;
    }
    if (!text.trim()) {
      setError("That file is empty.");
      return;
    }

    // Local, no-AI-call pass: finds IPs/MACs/emails/explicit "fill this in"
    // markers and turns them into {{key}} placeholders too, on top of any
    // {{key}} the document already had. Runs on every import automatically
    // since nothing leaves the machine for this — see handleAnalyzeWithAi
    // for the optional, explicit, more-thorough alternative.
    const { template: templatized, defaults: heuristicDefaults } = detectAndTemplatizeVariables(
      text,
      new Set(extractPlaceholders(text))
    );
    text = templatized;

    // Best-effort title: first Markdown H1 in the file, else the filename.
    const titleMatch = /^#\s+(.+)$/m.exec(text);
    const derivedTitle = titleMatch?.[1]?.trim() || file.name.replace(/\.(md|markdown|txt|docx)$/i, "");

    // Same auto-detection SopWorkspace already uses when you hand-edit the
    // Source tab (handleTemplateChange) — any {{key}} in the imported text
    // becomes an editable field, with a sensible default type/label. Fields
    // the heuristic pass just inserted get their actual found value as the
    // default (so the document still renders exactly as imported); plain
    // pre-existing {{key}} placeholders have no known default, same as before.
    const placeholders = extractPlaceholders(text);
    const importedVariables: SopVariable[] = placeholders.map((key) => ({
      key,
      label: humanizeKey(key),
      description:
        key in heuristicDefaults ? "Auto-detected value — review it and adjust if needed." : "Detected from the imported document.",
      default: heuristicDefaults[key] ?? "",
      type: "string" as const,
    }));

    setTopic(derivedTitle);
    setMeta({
      title: derivedTitle,
      category: "Imported",
      overview: `Imported from ${file.name}.`,
      prerequisites: [],
    });
    setVariables(importedVariables);
    setValues(Object.fromEntries(importedVariables.map((v) => [v.key, v.default])));
    setTemplate(text);
    // Treated as user-added/removable, same as AddFieldDialog fields — these
    // weren't declared by a trusted AI generation step.
    setCustomKeys(new Set(importedVariables.map((v) => v.key)));
    setPreviewMode("source");
    setError(null);
    setErrorDetail(null);
    // Import is an unrelated flow (editing existing content, no AI call) —
    // reference files attached for a previous generation attempt wouldn't
    // meaningfully apply to a freshly-imported, unrelated document.
    setContextFiles([]);
    setLibraryId(null);
  }

  // Takes the whole batch from one file-picker selection at once, rather
  // than being called per-file in a loop — a per-file version that checked
  // `contextFiles.length`/reduce against component state read the same
  // stale (pre-update) value on every call in the batch, since none of the
  // setContextFiles calls from earlier iterations had actually applied yet
  // by the time the next iteration's checks ran. Reproduced live by
  // attaching 10 files in one picker action with 1 already attached: the
  // cap check passed on all 10 (each saw length=1), landing 11 files
  // instead of being capped at 10. Batching reads `contextFiles` exactly
  // once, so there's nothing to go stale.
  async function handleAddContextFiles(files: File[]) {
    if (files.length === 0) return;

    const availableSlots = MAX_CONTEXT_FILES - contextFiles.length;
    if (availableSlots <= 0) {
      setError(`You can attach at most ${MAX_CONTEXT_FILES} reference files.`);
      return;
    }
    const toProcess = files.slice(0, availableSlots);
    const droppedForCount = files.length - toProcess.length;

    const reads = await Promise.all(
      toProcess.map(async (file) => {
        try {
          const rawContent = await readFileAsText(file);
          if (!rawContent.trim()) return { file, content: null as string | null, redactedCount: 0, error: `"${file.name}" is empty.` };
          // Scrub anything that looks like a secret (API key, password,
          // private key, etc.) before this content ever enters state that
          // could be sent to the AI — attached files exist specifically to
          // be sent, so this has to happen at attach time, not send time.
          const { text: content, count: redactedCount } = redactSecrets(rawContent);
          return { file, content, redactedCount, error: null as string | null };
        } catch {
          return { file, content: null as string | null, redactedCount: 0, error: `Could not read "${file.name}".` };
        }
      })
    );

    const firstReadError = reads.find((r) => r.error)?.error ?? null;

    let runningTotal = contextFiles.reduce((sum, f) => sum + f.content.length, 0);
    const accepted: ContextAttachment[] = [];
    let droppedForSize = 0;
    for (const { file, content, redactedCount, error } of reads) {
      if (error || content === null) continue;
      if (runningTotal + content.length > MAX_CONTEXT_TOTAL_CHARS) {
        droppedForSize++;
        continue;
      }
      accepted.push({ name: file.name, content, redactedCount });
      runningTotal += content.length;
    }

    if (accepted.length > 0) {
      setContextFiles((prev) => [...prev, ...accepted]);
    }

    if (firstReadError) {
      setError(firstReadError);
    } else if (droppedForSize > 0) {
      setError(
        `Attached reference files total ${MAX_CONTEXT_TOTAL_CHARS.toLocaleString()} characters or fewer — ${droppedForSize} file(s) weren't added.`
      );
    } else if (droppedForCount > 0) {
      setError(`You can attach at most ${MAX_CONTEXT_FILES} reference files — ${droppedForCount} file(s) weren't added.`);
    } else {
      setError(null);
      setErrorDetail(null);
    }
  }

  function handleRemoveContextFile(name: string) {
    setContextFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function handleSuggestIdeas() {
    if (contextFiles.length === 0) return;
    setSuggestingIdeas(true);
    setSuggestedIdeas(null);
    setError(null);
    setErrorDetail(null);
    try {
      // contextFiles are already redacted at attach time (handleAddContextFiles).
      const res = await fetch("/api/suggest-ideas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context: contextFiles }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to suggest SOP ideas.");
        setErrorDetail(typeof data.detail === "string" ? data.detail : null);
        return;
      }
      setSuggestedIdeas(data.ideas as SopIdea[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error suggesting SOP ideas.");
    } finally {
      setSuggestingIdeas(false);
    }
  }

  async function handleAnalyzeWithAi() {
    if (!template.trim()) return;
    const confirmed = window.confirm(
      "This sends the full document (not just a topic) to your configured AI provider so it can find and parameterize " +
        "site-specific values. Unlike normal generation, the whole document leaves this machine for this one action. " +
        "Values that look like API keys/passwords/tokens are automatically redacted first, but that's best-effort — " +
        "don't do this with proprietary or confidential content. Continue?"
    );
    if (!confirmed) return;

    setAnalyzing(true);
    setError(null);
    setErrorDetail(null);
    try {
      const { text: redactedDocument } = redactSecrets(renderTemplate(template, values));
      const res = await fetch("/api/analyze-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: redactedDocument }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to analyze document.");
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

      setMeta({ title: sop.title, category: sop.category, overview: sop.overview, prerequisites: sop.prerequisites });
      setVariables(sop.variables);
      setValues(Object.fromEntries(sop.variables.map((v) => [v.key, v.default])));
      setTemplate(sop.template_markdown);
      // Still part of the Import workflow (adjusting user-supplied content),
      // not the trusted from-scratch Generate pipeline — kept removable.
      setCustomKeys(new Set(sop.variables.map((v) => v.key)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error analyzing document.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleReviewAndImprove() {
    if (!template.trim()) return;
    const confirmed = window.confirm(
      "This sends the full document (not just a topic) to your configured AI provider, which may rewrite or add to it " +
        "to fix issues (missing safety checkpoints, hardcoded values that should be variables, non-executable rollback " +
        "steps). Unlike normal generation, the whole document leaves this machine for this one action. Values that " +
        "look like API keys/passwords/tokens are automatically redacted first, but that's best-effort — don't do " +
        "this with proprietary or confidential content. Continue?"
    );
    if (!confirmed) return;

    setImproving(true);
    setError(null);
    setErrorDetail(null);
    try {
      const { text: redactedDocument } = redactSecrets(renderTemplate(template, values));
      const res = await fetch("/api/review-improve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: redactedDocument }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to review document.");
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

      setMeta({ title: sop.title, category: sop.category, overview: sop.overview, prerequisites: sop.prerequisites });
      setVariables(sop.variables);
      setValues(Object.fromEntries(sop.variables.map((v) => [v.key, v.default])));
      setTemplate(sop.template_markdown);
      setCustomKeys(new Set(sop.variables.map((v) => v.key)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error reviewing document.");
    } finally {
      setImproving(false);
    }
  }

  function handleStartBlank() {
    if (hasSop) {
      const confirmed = window.confirm("Starting a blank SOP will discard your current field values and edits. Continue?");
      if (!confirmed) return;
    }
    setTopic("");
    setMeta({ title: "Untitled SOP", category: "Draft", overview: "", prerequisites: [] });
    setVariables([]);
    setValues({});
    setTemplate("# Untitled SOP\n\n");
    setCustomKeys(new Set());
    setPreviewMode("source");
    setError(null);
    setErrorDetail(null);
    setContextFiles([]);
    setLibraryId(null);
  }

  async function handleSaveToLibrary() {
    if (!meta) return;
    setSaving(true);
    try {
      const id = libraryId ?? crypto.randomUUID();
      const now = new Date().toISOString();
      const record: SavedSop = {
        id,
        title: meta.title,
        category: meta.category,
        overview: meta.overview,
        prerequisites: meta.prerequisites,
        variables,
        values,
        template,
        customKeys: Array.from(customKeys),
        topic,
        createdAt: libraryId ? "" : now, // overwritten below when updating an existing record
        updatedAt: now,
      };
      // Preserve the original createdAt when updating an existing record —
      // saveSopToLibrary does a plain put(), so without this an update would
      // silently lose when the SOP was first saved.
      if (libraryId) {
        const all = await listSavedSops();
        const prior = all.find((s) => s.id === libraryId);
        record.createdAt = prior?.createdAt || now;
      }
      await saveSopToLibrary(record);
      setLibraryId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save to the library.");
    } finally {
      setSaving(false);
    }
  }

  function handleLoadFromLibrary(sop: SavedSop) {
    if (hasSop) {
      const confirmed = window.confirm("Loading a saved SOP will discard your current field values and edits. Continue?");
      if (!confirmed) return;
    }
    setTopic(sop.topic);
    setMeta({ title: sop.title, category: sop.category, overview: sop.overview, prerequisites: sop.prerequisites });
    setVariables(sop.variables);
    setValues(sop.values);
    setTemplate(sop.template);
    setCustomKeys(new Set(sop.customKeys));
    setPreviewMode("preview");
    setError(null);
    setErrorDetail(null);
    setContextFiles([]);
    setLibraryId(sop.id);
    setLibraryOpen(false);
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

  async function handleExportDocx() {
    setExportingDocx(true);
    setError(null);
    try {
      const rendered = renderTemplate(template, values);
      const blob = await markdownToDocxBlob(meta?.title || topic || "SOP", rendered);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugify(meta?.title || topic || "sop")}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export DOCX.");
    } finally {
      setExportingDocx(false);
    }
  }

  async function handleInsertImage(file: File) {
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError("That image is too large — 5MB max.");
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not read that image."));
        reader.readAsDataURL(file);
      });
      // Appended rather than inserted at cursor — same "add then reposition
      // by hand in Source" pattern AddFieldDialog already uses for custom
      // fields, so there's one mental model instead of two.
      setTemplate((prev) => `${prev.trimEnd()}\n\n![${file.name}](${dataUrl})\n`);
      setPreviewMode("source");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not insert that image.");
    }
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
        <button
          type="button"
          onClick={() => setLibraryOpen(true)}
          title="Browse saved SOPs (local to this device)"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded-md transition-colors"
        >
          <LibraryIcon className="size-3.5" />
          Library
        </button>
        <UpdatePanel />
        <DesktopUpdatePanel />
        <PreferencesPanel hoverHighlightEnabled={hoverHighlightEnabled} onHoverHighlightChange={setHoverHighlightEnabled} />
        <DesktopSettingsPanel />
      </header>

      <LibraryPanel open={libraryOpen} onClose={() => setLibraryOpen(false)} onLoad={handleLoadFromLibrary} />

      <TopicInput
        onSubmit={(t) => void generate(t)}
        onImport={(f) => void handleImport(f)}
        onStartBlank={handleStartBlank}
        loading={loading}
        initialValue={topic}
        contextFiles={contextFiles}
        onAddContextFiles={(files) => void handleAddContextFiles(files)}
        onRemoveContextFile={handleRemoveContextFile}
        onSuggestIdeas={() => void handleSuggestIdeas()}
        suggestingIdeas={suggestingIdeas}
        suggestedIdeas={suggestedIdeas}
        onClearSuggestedIdeas={() => setSuggestedIdeas(null)}
      />

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
            <button
              type="button"
              onClick={handleStartBlank}
              className="text-sm text-indigo-400 hover:text-indigo-300 underline underline-offset-2 mt-2"
            >
              …or start with a blank document
            </button>
          </div>
        </div>
      )}

      {hasSop && meta && (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
          <div className="flex flex-col min-h-0 gap-4 overflow-y-auto pr-1">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <input
                  value={meta.category}
                  onChange={(e) => setMeta((prev) => (prev ? { ...prev, category: e.target.value } : prev))}
                  title="Category — used to organize the library"
                  className="text-[11px] font-medium uppercase tracking-wide text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/60 w-32"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveToLibrary()}
                  disabled={saving}
                  title={libraryId ? "Update this SOP in the library" : "Save this SOP to the local library"}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 transition-colors"
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  {libraryId ? "Update Saved Copy" : "Save to Library"}
                </button>
              </div>
              <input
                value={meta.title}
                onChange={(e) => setMeta((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                title="SOP title"
                className="text-base font-semibold text-white bg-transparent border border-transparent hover:border-border focus:border-border rounded px-1 -mx-1 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500/60"
              />
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
                onHoverField={hoverHighlightEnabled ? setHoveredKey : undefined}
              />
            </div>
          </div>

          <div className="flex flex-col min-h-0 gap-3">
            <ActionBar
              onRegenerate={handleRegenerate}
              regenerating={loading}
              disabled={loading || analyzing || improving}
              onCopy={handleCopy}
              onExportMarkdown={handleExportMarkdown}
              onExportPdf={handleExportPdf}
              onExportDocx={() => void handleExportDocx()}
              exportingDocx={exportingDocx}
              onInsertImage={(f) => void handleInsertImage(f)}
              existingKeys={new Set(variables.map((v) => v.key))}
              onAddField={handleAddField}
              onAnalyzeWithAi={() => void handleAnalyzeWithAi()}
              analyzing={analyzing}
              onReviewAndImprove={() => void handleReviewAndImprove()}
              improving={improving}
            />
            <MarkdownPreview
              template={template}
              values={values}
              variables={variables}
              onTemplateChange={handleTemplateChange}
              mode={previewMode}
              onModeChange={setPreviewMode}
              hoveredKey={hoveredKey}
              hoverHighlightEnabled={hoverHighlightEnabled}
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
