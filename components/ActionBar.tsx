"use client";

import { useState } from "react";
import { Check, Copy, Download, Printer, RefreshCw } from "lucide-react";
import AddFieldDialog from "@/components/AddFieldDialog";
import type { SopVariable } from "@/types/sop";

interface ActionBarProps {
  onRegenerate: () => void;
  regenerating: boolean;
  disabled: boolean;
  onCopy: () => void;
  onExportMarkdown: () => void;
  onExportPdf: () => void;
  existingKeys: Set<string>;
  onAddField: (variable: SopVariable) => void;
}

export default function ActionBar({
  onRegenerate,
  regenerating,
  disabled,
  onCopy,
  onExportMarkdown,
  onExportPdf,
  existingKeys,
  onAddField,
}: ActionBarProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 relative">
      <button
        type="button"
        onClick={onRegenerate}
        disabled={disabled || regenerating}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <RefreshCw className={`size-3.5 ${regenerating ? "animate-spin" : ""}`} />
        Regenerate
      </button>

      <AddFieldDialog existingKeys={existingKeys} onAdd={onAddField} />

      <div className="flex-1" />

      <button
        type="button"
        onClick={handleCopy}
        disabled={disabled}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        type="button"
        onClick={onExportMarkdown}
        disabled={disabled}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Download className="size-3.5" />
        Export .md
      </button>
      <button
        type="button"
        onClick={onExportPdf}
        disabled={disabled}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Printer className="size-3.5" />
        Export PDF
      </button>
    </div>
  );
}
