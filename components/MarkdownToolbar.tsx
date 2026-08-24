"use client";

import { RefObject } from "react";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Strikethrough,
  Table2,
} from "lucide-react";
import type { EditorAdapter } from "@/components/LiveMarkdownEditor";

interface EditResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

interface MarkdownToolbarProps {
  adapter: EditorAdapter;
  value: string;
  onChange: (next: string) => void;
}

/** Wraps a plain `<textarea>` ref in the same get/set-selection shape the live (CodeMirror) editor exposes, so one toolbar drives either. */
export function textareaAdapter(textareaRef: RefObject<HTMLTextAreaElement | null>, fallbackLength: number): EditorAdapter {
  return {
    getSelection: () => ({
      start: textareaRef.current?.selectionStart ?? fallbackLength,
      end: textareaRef.current?.selectionEnd ?? fallbackLength,
    }),
    setSelection: (start, end) => textareaRef.current?.setSelectionRange(start, end),
    focus: () => textareaRef.current?.focus(),
  };
}

/**
 * Formatting toolbar shared by both the Source (raw textarea) and Rendered
 * (live CodeMirror) editors — click Bold instead of typing "**", etc.
 * Operates through the `adapter`'s get/set-selection rather than reaching
 * into a specific editor implementation, so the same buttons work for
 * either without a second copy of this component.
 */
export default function MarkdownToolbar({ adapter, value, onChange }: MarkdownToolbarProps) {
  function apply(edit: (text: string, start: number, end: number) => EditResult) {
    const { start, end } = adapter.getSelection();
    const result = edit(value, start, end);
    onChange(result.text);
    // Both editors are controlled components — the new value only takes
    // effect after React re-renders, so the selection can't be restored
    // synchronously here.
    requestAnimationFrame(() => {
      adapter.focus();
      adapter.setSelection(result.selectionStart, result.selectionEnd);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border pb-1.5 mb-1.5">
      <ToolbarButton title="Bold" onClick={() => apply((t, s, e) => wrapSelection(t, s, e, "**", "**", "bold text"))}>
        <Bold className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Italic" onClick={() => apply((t, s, e) => wrapSelection(t, s, e, "_", "_", "italic text"))}>
        <Italic className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Inline code" onClick={() => apply((t, s, e) => wrapSelection(t, s, e, "`", "`", "code"))}>
        <Code className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Strikethrough"
        onClick={() => apply((t, s, e) => wrapSelection(t, s, e, "~~", "~~", "strikethrough text"))}
      >
        <Strikethrough className="size-3.5" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton title="Heading 1" onClick={() => apply((t, s, e) => setHeadingLevel(t, s, e, 1))}>
        <Heading1 className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Heading 2" onClick={() => apply((t, s, e) => setHeadingLevel(t, s, e, 2))}>
        <Heading2 className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Heading 3" onClick={() => apply((t, s, e) => setHeadingLevel(t, s, e, 3))}>
        <Heading3 className="size-3.5" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        title="Bullet list"
        onClick={() => apply((t, s, e) => applyLinePrefix(t, s, e, () => "- ", /^-\s+/))}
      >
        <List className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Numbered list"
        onClick={() => apply((t, s, e) => applyLinePrefix(t, s, e, (i) => `${i + 1}. `, /^\d+\.\s+/))}
      >
        <ListOrdered className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Blockquote"
        onClick={() => apply((t, s, e) => applyLinePrefix(t, s, e, () => "> ", /^>\s?/))}
      >
        <Quote className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Task list"
        onClick={() => apply((t, s, e) => applyLinePrefix(t, s, e, () => "- [ ] ", /^-\s\[[ x]\]\s+/))}
      >
        <ListTodo className="size-3.5" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton title="Table" onClick={() => apply((t, s, e) => insertSnippet(t, s, e, "\n\n| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |\n\n"))}>
        <Table2 className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Code block"
        onClick={() => apply((t, s, e) => wrapSelection(t, s, e, "\n\n```\n", "\n```\n\n", "code here"))}
      >
        <span className="text-[10px] font-mono font-semibold px-0.5">{"{ }"}</span>
      </ToolbarButton>
      <ToolbarButton title="Link" onClick={() => apply(insertLink)}>
        <Link2 className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Horizontal rule" onClick={() => apply((t, s, e) => insertSnippet(t, s, e, "\n\n---\n\n"))}>
        <Minus className="size-3.5" />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()} // keep textarea focus/selection intact
      onClick={onClick}
      className="flex items-center justify-center size-7 rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-border mx-1" />;
}

function wrapSelection(text: string, start: number, end: number, before: string, after: string, placeholder: string): EditResult {
  const selected = text.slice(start, end) || placeholder;
  const newText = text.slice(0, start) + before + selected + after + text.slice(end);
  const selectionStart = start + before.length;
  return { text: newText, selectionStart, selectionEnd: selectionStart + selected.length };
}

function currentLineRange(text: string, start: number, end: number): { lineStart: number; lineEnd: number } {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = text.indexOf("\n", Math.max(end - 1, lineStart));
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  return { lineStart, lineEnd };
}

function setHeadingLevel(text: string, start: number, end: number, level: number): EditResult {
  const { lineStart, lineEnd } = currentLineRange(text, start, end);
  const line = text.slice(lineStart, lineEnd);
  const stripped = line.replace(/^#{1,6}\s+/, "");
  const newLine = "#".repeat(level) + " " + stripped;
  const newText = text.slice(0, lineStart) + newLine + text.slice(lineEnd);
  const cursor = lineStart + newLine.length;
  return { text: newText, selectionStart: cursor, selectionEnd: cursor };
}

function applyLinePrefix(
  text: string,
  start: number,
  end: number,
  makePrefix: (lineIndex: number) => string,
  toggleMarker: RegExp
): EditResult {
  const { lineStart, lineEnd } = currentLineRange(text, start, end);
  const block = text.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const contentLines = lines.filter((l) => l.trim() !== "");
  const allPrefixed = contentLines.length > 0 && contentLines.every((l) => toggleMarker.test(l));

  let contentIndex = 0;
  const newLines = lines.map((l) => {
    if (l.trim() === "") return l;
    const prefixed = allPrefixed ? l.replace(toggleMarker, "") : makePrefix(contentIndex) + l;
    contentIndex++;
    return prefixed;
  });
  const newBlock = newLines.join("\n");
  const newText = text.slice(0, lineStart) + newBlock + text.slice(lineEnd);
  return { text: newText, selectionStart: lineStart, selectionEnd: lineStart + newBlock.length };
}

function insertSnippet(text: string, start: number, end: number, snippet: string): EditResult {
  const newText = text.slice(0, start) + snippet + text.slice(end);
  const cursor = start + snippet.length;
  return { text: newText, selectionStart: cursor, selectionEnd: cursor };
}

function insertLink(text: string, start: number, end: number): EditResult {
  const linkText = text.slice(start, end) || "link text";
  const url = "url";
  const newText = text.slice(0, start) + `[${linkText}](${url})` + text.slice(end);
  const urlStart = start + 1 + linkText.length + 2; // past "[linkText]("
  return { text: newText, selectionStart: urlStart, selectionEnd: urlStart + url.length };
}
