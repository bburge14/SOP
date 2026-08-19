"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import {
  FilePlus2,
  FileText,
  Lightbulb,
  Loader2,
  Paperclip,
  ShieldAlert,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useOnClickOutside } from "@/lib/hooks/useOnClickOutside";
import type { ContextAttachment, SopIdea } from "@/types/sop";

interface TopicInputProps {
  onSubmit: (topic: string) => void;
  onImport: (file: File) => void;
  onStartBlank: () => void;
  loading: boolean;
  initialValue?: string;
  contextFiles: ContextAttachment[];
  onAddContextFiles: (files: File[]) => void;
  onRemoveContextFile: (name: string) => void;
  onSuggestIdeas: () => void;
  suggestingIdeas: boolean;
  suggestedIdeas: SopIdea[] | null;
  onClearSuggestedIdeas: () => void;
}

export default function TopicInput({
  onSubmit,
  onImport,
  onStartBlank,
  loading,
  initialValue = "",
  contextFiles,
  onAddContextFiles,
  onRemoveContextFile,
  onSuggestIdeas,
  suggestingIdeas,
  suggestedIdeas,
  onClearSuggestedIdeas,
}: TopicInputProps) {
  const [topic, setTopic] = useState(initialValue);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextInputRef = useRef<HTMLInputElement>(null);
  const ideasPanelRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(ideasPanelRef, onClearSuggestedIdeas, suggestedIdeas !== null);

  // `initialValue` is only consumed by useState on the very first render —
  // without this, the box silently kept showing "" after Import (which sets
  // the parent's topic from the file's derived title) or a Library load,
  // even though the underlying topic state was actually correct (so
  // Regenerate still worked; only the visible text was stale). Reproduced
  // live: imported a file and the topic bar stayed blank immediately
  // afterward. Only resyncs when `initialValue` itself changes, so it
  // doesn't fight with the user's own typing (which never touches that prop).
  useEffect(() => setTopic(initialValue), [initialValue]);

  function handlePickIdea(idea: SopIdea) {
    setTopic(idea.title);
    onClearSuggestedIdeas();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!topic.trim() || loading) return;
    onSubmit(topic.trim());
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onImport(file);
    e.target.value = ""; // allow re-importing the same file later
  }

  function handleContextFilesChange(e: ChangeEvent<HTMLInputElement>) {
    onAddContextFiles(Array.from(e.target.files ?? []));
    e.target.value = ""; // allow re-attaching the same file later
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder='e.g. "Cisco Catalyst 2960 initial VLAN configuration"'
          className="flex-1 bg-panel border border-border rounded-lg px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
          disabled={loading}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          title="Import an existing SOP (.md or .docx) to edit"
          className="flex items-center gap-2 border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Upload className="size-4" />
          Import
        </button>
        <input
          ref={contextInputRef}
          type="file"
          multiple
          onChange={handleContextFilesChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => contextInputRef.current?.click()}
          disabled={loading}
          title="Attach README/source/config files as reference material for the AI — useful for internal or non-public programs it has no other knowledge of"
          className="flex items-center gap-2 border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Paperclip className="size-4" />
          Attach Reference
        </button>
        <button
          type="button"
          onClick={onStartBlank}
          disabled={loading}
          title="Start a blank SOP to hand-write, no AI call"
          className="flex items-center gap-2 border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <FilePlus2 className="size-4" />
          New
        </button>
        <button
          type="submit"
          disabled={loading || !topic.trim()}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {loading ? "Generating…" : "Generate SOP"}
        </button>
      </form>

      {contextFiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2 px-0.5">
          {contextFiles.map((file) => (
            <span
              key={file.name}
              className="flex items-center gap-1.5 text-xs bg-panel border border-border rounded-md pl-2 pr-1 py-1 text-slate-300"
            >
              <FileText className="size-3.5 text-slate-500" />
              {file.name}
              {!!file.redactedCount && (
                <span
                  className="text-amber-400"
                  title={`${file.redactedCount} value(s) that looked like API keys/passwords/tokens were redacted before this was attached`}
                >
                  ({file.redactedCount} redacted)
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemoveContextFile(file.name)}
                className="text-slate-500 hover:text-red-400 p-0.5"
                aria-label={`Remove attached file ${file.name}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}

          <div className="relative">
            <button
              type="button"
              onClick={onSuggestIdeas}
              disabled={loading || suggestingIdeas}
              title="Ask the AI what SOPs are worth writing based on the attached files"
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {suggestingIdeas ? <Loader2 className="size-3.5 animate-spin" /> : <Lightbulb className="size-3.5" />}
              Suggest Ideas
            </button>

            {suggestedIdeas && (
              <div
                ref={ideasPanelRef}
                className="absolute left-0 z-20 mt-2 w-96 bg-panel border border-border rounded-lg p-3 shadow-xl space-y-1.5 max-h-80 overflow-y-auto"
              >
                <h3 className="text-xs font-semibold text-white px-1 pb-1">SOP ideas from your attached files</h3>
                {suggestedIdeas.length === 0 ? (
                  <p className="text-xs text-slate-500 px-1 pb-1">No ideas came back — try attaching more detailed material.</p>
                ) : (
                  suggestedIdeas.map((idea, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handlePickIdea(idea)}
                      className="block w-full text-left rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors"
                    >
                      <span className="block text-sm text-slate-200">{idea.title}</span>
                      <span className="block text-xs text-slate-500 mt-0.5">{idea.description}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-xs text-slate-600 mt-1.5 px-0.5">
        <ShieldAlert className="size-3.5 shrink-0 mt-0.5" />
        <span>
          Don&apos;t include proprietary, confidential, or personal information in your topic — it&apos;s sent to an
          external AI service to generate content. Attached reference files (README/source/config for your own
          internal or non-public tools) are sent in full the same way — values that look like API keys, passwords,
          or tokens are automatically redacted before attaching, but that&apos;s best-effort, not a guarantee, so
          only attach what you&apos;re comfortable sharing with your AI provider. Nothing is saved unless you click
          Save to Library — saved SOPs stay on this device and are never sent anywhere on their own.
        </span>
      </p>
    </div>
  );
}
