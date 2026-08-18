"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Code2, Eye } from "lucide-react";
import type { VariableValues } from "@/types/sop";
import { renderTemplate } from "@/lib/sop/template";

export type PreviewMode = "preview" | "source";

interface MarkdownPreviewProps {
  template: string;
  values: VariableValues;
  onTemplateChange: (next: string) => void;
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
}

export default function MarkdownPreview({ template, values, onTemplateChange, mode, onModeChange }: MarkdownPreviewProps) {
  const rendered = renderTemplate(template, values);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 mb-2">
        <TabButton active={mode === "preview"} onClick={() => onModeChange("preview")} icon={<Eye className="size-3.5" />}>
          Rendered
        </TabButton>
        <TabButton active={mode === "source"} onClick={() => onModeChange("source")} icon={<Code2 className="size-3.5" />}>
          Source
        </TabButton>
      </div>

      <div className="flex-1 min-h-0 bg-panel border border-border rounded-lg overflow-hidden">
        {mode === "preview" ? (
          <div id="print-target" className="h-full overflow-y-auto p-6">
            <div className="sop-prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{rendered}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <textarea
            value={template}
            onChange={(e) => onTemplateChange(e.target.value)}
            spellCheck={false}
            className="w-full h-full resize-none bg-transparent p-4 font-mono text-xs leading-relaxed text-slate-300 focus:outline-none"
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
        active ? "bg-panel border border-border text-white" : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
