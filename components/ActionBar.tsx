"use client";

import { ChangeEvent, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileType2,
  ImagePlus,
  Loader2,
  Printer,
  RefreshCw,
  ScanSearch,
  WandSparkles,
} from "lucide-react";
import AddFieldDialog from "@/components/AddFieldDialog";
import type { SopVariable } from "@/types/sop";

interface ActionBarProps {
  onRegenerate: () => void;
  regenerating: boolean;
  disabled: boolean;
  onCopy: () => void;
  onExportMarkdown: () => void;
  onExportPdf: () => void;
  onExportDocx: () => void;
  exportingDocx: boolean;
  onInsertImage: (file: File) => void;
  existingKeys: Set<string>;
  onAddField: (variable: SopVariable) => void;
  onAnalyzeWithAi: () => void;
  analyzing: boolean;
  onReviewAndImprove: () => void;
  improving: boolean;
}

export default function ActionBar({
  onRegenerate,
  regenerating,
  disabled,
  onCopy,
  onExportMarkdown,
  onExportPdf,
  onExportDocx,
  exportingDocx,
  onInsertImage,
  existingKeys,
  onAddField,
  onAnalyzeWithAi,
  analyzing,
  onReviewAndImprove,
  improving,
}: ActionBarProps) {
  const [copied, setCopied] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onInsertImage(file);
    e.target.value = "";
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

      <button
        type="button"
        onClick={onAnalyzeWithAi}
        disabled={disabled || analyzing}
        title="Send this document to your AI provider to find and parameterize site-specific values"
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {analyzing ? <Loader2 className="size-3.5 animate-spin" /> : <ScanSearch className="size-3.5" />}
        Scan with AI
      </button>

      <button
        type="button"
        onClick={onReviewAndImprove}
        disabled={disabled || improving}
        title="Send this document to your AI provider to fix quality issues (missing safety checkpoints, coupled hardcoded values, non-executable rollback steps) — may rewrite or add content"
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {improving ? <Loader2 className="size-3.5 animate-spin" /> : <WandSparkles className="size-3.5" />}
        Review &amp; Improve
      </button>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/bmp"
        onChange={handleImageChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => imageInputRef.current?.click()}
        disabled={disabled}
        title="Insert an image into the document"
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ImagePlus className="size-3.5" />
        Insert Image
      </button>

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
        onClick={onExportDocx}
        disabled={disabled || exportingDocx}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {exportingDocx ? <Loader2 className="size-3.5 animate-spin" /> : <FileType2 className="size-3.5" />}
        Export .docx
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
