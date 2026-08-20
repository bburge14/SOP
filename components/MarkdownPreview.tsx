"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Code2, Eye } from "lucide-react";
import type { SopVariable, VariableValues } from "@/types/sop";
import { remarkSubstituteVariables } from "@/lib/sop/remarkSubstituteVariables";
import { remarkGithubAlerts } from "@/lib/sop/remarkGithubAlerts";
import MarkdownToolbar from "@/components/MarkdownToolbar";

export type PreviewMode = "preview" | "source";

interface MarkdownPreviewProps {
  template: string;
  values: VariableValues;
  variables: SopVariable[];
  onTemplateChange: (next: string) => void;
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
  hoveredKey: string | null;
  hoverHighlightEnabled: boolean;
}

export default function MarkdownPreview({
  template,
  values,
  variables,
  onTemplateChange,
  mode,
  onModeChange,
  hoveredKey,
  hoverHighlightEnabled,
}: MarkdownPreviewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Hover a field in the left pane -> highlight (and scroll to) its
  // occurrence(s) in the rendered preview. The opposite direction (hover
  // text in the preview -> see which field it is) needs no JS at all: the
  // spans remark-substitute-variables produces carry their own `title`
  // tooltip and a plain CSS :hover highlight (app/globals.css).
  useEffect(() => {
    if (!hoveredKey || !hoverHighlightEnabled || mode !== "preview") return;
    const container = previewRef.current;
    if (!container) return;
    const selector = `[data-sop-var="${CSS.escape(hoveredKey)}"]`;
    const matches = container.querySelectorAll<HTMLElement>(selector);
    matches.forEach((el) => el.classList.add("sop-var-highlight"));

    // Deliberately not Element.scrollIntoView(): per spec it may scroll
    // every scrollable ancestor, not just the nearest one — reproduced
    // live, it nudged the whole page (including the left field-list pane)
    // by tens of pixels while the mouse stayed put, so a DIFFERENT field
    // row ended up under the still-hovering cursor mid-hover, firing a
    // genuine mouseleave/mouseenter that jumped the highlight to the wrong
    // field. Scrolling only this container's own scrollTop can't cascade
    // to any ancestor, so it can't cause that.
    const first = matches[0];
    if (first) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = first.getBoundingClientRect();
      const delta = targetRect.top - containerRect.top - container.clientHeight / 2 + targetRect.height / 2;
      container.scrollBy({ top: delta, behavior: "smooth" });
    }

    return () => matches.forEach((el) => el.classList.remove("sop-var-highlight"));
  }, [hoveredKey, hoverHighlightEnabled, mode]);

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

      <div className="flex-1 min-h-0 bg-panel border border-border rounded-lg overflow-hidden flex flex-col">
        {mode === "preview" ? (
          <div id="print-target" ref={previewRef} className="h-full overflow-y-auto p-6">
            <div className="sop-prose">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkGithubAlerts, remarkSubstituteVariables(values, variables)]}>
                {template}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full p-2 pb-0">
            <MarkdownToolbar textareaRef={textareaRef} value={template} onChange={onTemplateChange} />
            <textarea
              ref={textareaRef}
              value={template}
              onChange={(e) => onTemplateChange(e.target.value)}
              spellCheck={false}
              className="w-full flex-1 min-h-0 resize-none bg-transparent p-2 font-mono text-xs leading-relaxed text-slate-300 focus:outline-none"
            />
          </div>
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
