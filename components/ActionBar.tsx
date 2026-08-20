"use client";

import { ChangeEvent, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
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
import { useOnClickOutside } from "@/lib/hooks/useOnClickOutside";
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

// Shared by every icon-only button in this bar — square, bordered, tooltip
// via `title` instead of a visible label, to fit this many actions in one row.
const ICON_BUTTON =
  "flex items-center justify-center size-9 shrink-0 rounded-md border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

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
        title="Regenerate"
        className={ICON_BUTTON}
      >
        <RefreshCw className={`size-3.5 ${regenerating ? "animate-spin" : ""}`} />
      </button>

      <AddFieldDialog existingKeys={existingKeys} onAdd={onAddField} />

      <button
        type="button"
        onClick={onAnalyzeWithAi}
        disabled={disabled || analyzing}
        title="Scan with AI — send this document to your AI provider to find and parameterize site-specific values"
        className={ICON_BUTTON}
      >
        {analyzing ? <Loader2 className="size-3.5 animate-spin" /> : <ScanSearch className="size-3.5" />}
      </button>

      <button
        type="button"
        onClick={onReviewAndImprove}
        disabled={disabled || improving}
        title="Review & Improve — send this document to your AI provider to fix quality issues (missing safety checkpoints, coupled hardcoded values, non-executable rollback steps); may rewrite or add content"
        className={ICON_BUTTON}
      >
        {improving ? <Loader2 className="size-3.5 animate-spin" /> : <WandSparkles className="size-3.5" />}
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
        title="Insert Image"
        className={ICON_BUTTON}
      >
        <ImagePlus className="size-3.5" />
      </button>

      <div className="flex-1" />

      <button type="button" onClick={handleCopy} disabled={disabled} title={copied ? "Copied" : "Copy"} className={ICON_BUTTON}>
        {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      </button>

      <ExportMenu
        disabled={disabled}
        exportingDocx={exportingDocx}
        onExportMarkdown={onExportMarkdown}
        onExportDocx={onExportDocx}
        onExportPdf={onExportPdf}
      />
    </div>
  );
}

interface ExportMenuProps {
  disabled: boolean;
  exportingDocx: boolean;
  onExportMarkdown: () => void;
  onExportDocx: () => void;
  onExportPdf: () => void;
}

function ExportMenu({ disabled, exportingDocx, onExportMarkdown, onExportDocx, onExportPdf }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(containerRef, () => setOpen(false), open);

  function pick(action: () => void) {
    action();
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title="Export"
        className="flex items-center justify-center gap-0.5 h-9 px-2.5 shrink-0 rounded-md border border-border text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {exportingDocx ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-44 bg-panel border border-border rounded-lg py-1 shadow-xl">
          <MenuItem icon={<Download className="size-3.5" />} label="Export .md" onClick={() => pick(onExportMarkdown)} />
          <MenuItem
            icon={exportingDocx ? <Loader2 className="size-3.5 animate-spin" /> : <FileType2 className="size-3.5" />}
            label="Export .docx"
            onClick={() => pick(onExportDocx)}
            disabled={exportingDocx}
          />
          <MenuItem icon={<Printer className="size-3.5" />} label="Export PDF" onClick={() => pick(onExportPdf)} />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 w-full text-left text-xs font-medium px-3 py-2 text-slate-300 hover:text-white hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}
