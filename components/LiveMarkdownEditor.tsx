"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { liveMarkdownExtensions, setLiveVariablesEffect } from "@/lib/sop/liveMarkdownExtensions";
import type { SopVariable, VariableValues } from "@/types/sop";

/** Same shape MarkdownToolbar already uses for the Source textarea — lets one toolbar drive either editor. */
export interface EditorAdapter {
  getSelection(): { start: number; end: number };
  setSelection(start: number, end: number): void;
  focus(): void;
}

export interface LiveMarkdownEditorHandle extends EditorAdapter {
  getScrollElement(): HTMLElement | null;
}

interface LiveMarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  values: VariableValues;
  variables: SopVariable[];
  onHoverField?: (key: string | null) => void;
}

/**
 * The "Rendered" tab's actual editing surface — CodeMirror 6 underneath,
 * decorated live (see lib/sop/liveMarkdownExtensions.ts) so headings/bold/
 * italic/code/blockquotes/GFM alerts and {{key}} substitution all render
 * styled while you type, without ever converting the document out of
 * plain markdown text. `value`/`onChange` behave like a controlled
 * textarea; `values`/`variables` drive what each {{key}} chip displays.
 */
const LiveMarkdownEditor = forwardRef<LiveMarkdownEditorHandle, LiveMarkdownEditorProps>(function LiveMarkdownEditor(
  { value, onChange, values, variables, onHoverField },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Read fresh inside the updateListener without re-creating the editor
  // (which would drop undo history/scroll position) every time the parent
  // passes a new onChange closure.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
          ...liveMarkdownExtensions(),
        ],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally mount once. Content changes that happen outside this
    // editor (Regenerate, Import, Refine, Review & Improve, a Library
    // load, field removal) are synced in via the effect below instead of
    // remounting, so the editor doesn't lose undo history/scroll/focus on
    // every keystroke just because the parent re-rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value changes: only push into CodeMirror when it didn't
  // already produce this exact value itself (avoids clobbering the
  // in-progress edit/cursor position on every keystroke, since typing in
  // this editor also flows back up through `value` on the next render).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setLiveVariablesEffect.of({ values, variables, onHoverField }) });
  }, [values, variables, onHoverField]);

  useImperativeHandle(
    ref,
    () => ({
      getSelection() {
        const sel = viewRef.current?.state.selection.main;
        return { start: sel?.from ?? 0, end: sel?.to ?? 0 };
      },
      setSelection(start, end) {
        viewRef.current?.dispatch({ selection: { anchor: start, head: end } });
      },
      focus() {
        viewRef.current?.focus();
      },
      getScrollElement() {
        return viewRef.current?.scrollDOM ?? null;
      },
    }),
    []
  );

  return <div ref={containerRef} className="h-full sop-prose" />;
});

export default LiveMarkdownEditor;
