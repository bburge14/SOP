// CodeMirror 6 extensions that turn the plain markdown source into a
// "live preview" surface — headings/bold/italic/code/blockquotes get
// styled as you type instead of staying plain text, and {{key}}
// placeholders render as the same substituted chip the old read-only
// preview used, all without ever leaving markdown-the-string as the
// document's actual representation. That's the point of building this on
// CodeMirM6 instead of a rich-text/AST editor (TipTap, ProseMirror, etc):
// the underlying value is still exactly the same `template` string this
// app already treats as its one source of truth for export/copy/the AI
// pipeline — no separate document model to keep in sync, no lossy
// markdown<->rich-doc round trip.
//
// Deliberately NOT implemented (scope cut, not an oversight): hiding
// markdown syntax characters entirely while the cursor is elsewhere (the
// "Obsidian mode" where "**bold**" collapses to just a bold "bold" with
// the asterisks disappearing) — markers are dimmed/de-emphasized instead
// of hidden, which needs far less cursor-position-dependent decoration
// invalidation logic and can't silently corrupt the document by getting a
// hide/show transition wrong. Tables, images, and links render as plain
// (but still readable) text — no attempt at an interactive grid/embed.
import { EditorView, Decoration, type DecorationSet, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder, type Extension } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import type { SopVariable, VariableValues } from "@/types/sop";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

const ALERT_INFO: Record<string, { label: string; cssClass: string }> = {
  WARNING: { label: "⚠ Unverified — check before relying on this", cssClass: "cm-sop-alert-warning" },
  CAUTION: { label: "⚠ Caution", cssClass: "cm-sop-alert-caution" },
  IMPORTANT: { label: "❗ Important", cssClass: "cm-sop-alert-important" },
  NOTE: { label: "ℹ Note", cssClass: "cm-sop-alert-note" },
  TIP: { label: "💡 Tip", cssClass: "cm-sop-alert-tip" },
};
const ALERT_MARKER_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i;

export interface LiveVariablesConfig {
  values: VariableValues;
  variables: SopVariable[];
  onHoverField?: (key: string | null) => void;
}

/** Dispatched whenever `values`/`variables`/the hover callback change — lets the chips update without touching document content or selection. */
export const setLiveVariablesEffect = StateEffect.define<LiveVariablesConfig>();

const liveVariablesField = StateField.define<LiveVariablesConfig>({
  create: () => ({ values: {}, variables: [] }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLiveVariablesEffect)) return effect.value;
    }
    return value;
  },
});

/**
 * Renders one {{key}} as the same chip the old read-only preview used —
 * reuses the exact `sop-var-value`/`unbound-placeholder` CSS classes
 * (app/globals.css) for visual parity, and the same `data-sop-var`
 * attribute so hover-to-locate's existing querySelector-based highlight
 * logic works against this DOM unchanged.
 */
class VariableChipWidget extends WidgetType {
  constructor(
    readonly key: string,
    readonly label: string,
    readonly display: string,
    readonly isEmpty: boolean,
    readonly onHoverField?: (key: string | null) => void
  ) {
    super();
  }
  eq(other: VariableChipWidget): boolean {
    return this.key === other.key && this.display === other.display && this.isEmpty === other.isEmpty;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.textContent = this.display;
    span.className = "sop-var-value" + (this.isEmpty ? " unbound-placeholder" : "");
    span.setAttribute("data-sop-var", this.key);
    span.title = `Field: ${this.label}`;
    if (this.onHoverField) {
      const onHoverField = this.onHoverField;
      span.addEventListener("mouseenter", () => onHoverField(this.key));
      span.addEventListener("mouseleave", () => onHoverField(null));
    }
    return span;
  }
  // Atomic from the cursor's perspective (see atomicVariableRanges below),
  // but still a normal clickable/hoverable DOM node.
  ignoreEvent(): boolean {
    return false;
  }
}

function variableDecorations(view: EditorView): DecorationSet {
  const { values, variables, onHoverField } = view.state.field(liveVariablesField);
  const labelByKey = new Map(variables.map((v) => [v.key, v.label]));
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    PLACEHOLDER_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PLACEHOLDER_RE.exec(text))) {
      const key = match[1]!;
      const hasValue = key in values;
      const raw = values[key];
      const isEmpty = !hasValue || raw === undefined || raw === null || raw === "";
      const display = isEmpty ? match[0] : String(raw);
      const label = labelByKey.get(key) ?? key;
      const start = from + match.index;
      const end = start + match[0].length;
      builder.add(
        start,
        end,
        Decoration.replace({ widget: new VariableChipWidget(key, label, display, isEmpty, onHoverField) })
      );
    }
  }
  return builder.finish();
}

/** Keeps the cursor/backspace/selection treating each {{key}} chip as one atomic unit, not editable-into-the-middle-of text. */
const atomicVariableRanges = EditorView.atomicRanges.of((view) => variableDecorations(view));

const variableChipPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = variableDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || configChanged(update)) {
        this.decorations = variableDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

function configChanged(update: ViewUpdate): boolean {
  return update.transactions.some((tr) => tr.effects.some((e) => e.is(setLiveVariablesEffect)));
}

/** Line range (start of first line, end of last line) a doc position range spans — used to apply line-level decorations across a multi-line node. */
function lineRange(view: EditorView, from: number, to: number) {
  return { fromLine: view.state.doc.lineAt(from), toLine: view.state.doc.lineAt(to) };
}

/**
 * Walks the Lezer markdown syntax tree over the visible viewport and
 * layers on: heading size/weight (line decoration) with dimmed "#"
 * markers, bold/italic/strikethrough mark decorations with dimmed
 * delimiter marks, shaded inline code, and blockquote styling — GFM
 * alert blockquotes (`> [!WARNING]` etc.) get the same colored
 * label+border treatment as the old preview's remarkGithubAlerts.ts,
 * plain blockquotes get a plain quote treatment.
 */
interface RawRange {
  from: number;
  to: number;
  deco: Decoration;
}

/**
 * Walks the Lezer markdown syntax tree once and produces two SEPARATE
 * decoration lists — line decorations (heading size, blockquote/alert
 * background) and mark/replace decorations (bold, italic, dimmed markers,
 * the alert label widget). They're kept apart deliberately: CodeMirror's
 * `RangeSetBuilder` requires everything added to one builder to be
 * strictly sorted by `from` (and side, for same-start ranges), and
 * mixing zero-width line markers with variable-width mark ranges from a
 * totally different collection (a `Map` keyed by line number, built in
 * insertion order rather than document order) violated that and crashed
 * the whole plugin — reproduced live: every render silently failed with
 * "Ranges must be added sorted by `from` position", so the Rendered tab
 * never painted anything at all. Returning them as two separate
 * `ViewPlugin`s instead lets CodeMirror's own facet combination merge
 * them safely — the documented way multiple decoration sources are meant
 * to coexist, instead of a hand-rolled single-builder merge.
 */
function collectSyntaxRanges(view: EditorView): { lines: RawRange[]; marks: RawRange[] } {
  const marks: RawRange[] = [];
  const lineClasses = new Map<number, Set<string>>();

  function addLineClass(lineNumber: number, cls: string) {
    const set = lineClasses.get(lineNumber) ?? new Set<string>();
    set.add(cls);
    lineClasses.set(lineNumber, set);
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        switch (node.type.name) {
          case "ATXHeading1":
          case "ATXHeading2":
          case "ATXHeading3":
          case "ATXHeading4":
          case "ATXHeading5":
          case "ATXHeading6": {
            const level = node.type.name.slice(-1);
            addLineClass(view.state.doc.lineAt(node.from).number, `cm-sop-h${level}`);
            break;
          }
          case "HeaderMark":
            marks.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-sop-marker" }) });
            break;
          case "StrongEmphasis":
            marks.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-sop-strong" }) });
            break;
          case "Emphasis":
            marks.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-sop-em" }) });
            break;
          case "Strikethrough":
            marks.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-sop-strike" }) });
            break;
          case "EmphasisMark":
          case "StrikethroughMark":
          case "CodeMark":
            marks.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-sop-marker" }) });
            break;
          case "InlineCode":
            marks.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-sop-code" }) });
            break;
          case "QuoteMark":
            marks.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-sop-marker" }) });
            break;
          case "Blockquote": {
            const firstLine = view.state.doc.lineAt(node.from);
            const firstLineText = firstLine.text.replace(/^>\s?/, "");
            const alertMatch = ALERT_MARKER_RE.exec(firstLineText);
            const { fromLine, toLine } = lineRange(view, node.from, node.to);
            for (let n = fromLine.number; n <= toLine.number; n++) {
              addLineClass(n, "cm-sop-blockquote");
              if (alertMatch) addLineClass(n, ALERT_INFO[alertMatch[1]!.toUpperCase()]!.cssClass);
            }
            if (alertMatch) {
              const markerStart = firstLine.from + firstLine.text.indexOf("[!");
              const markerEnd = markerStart + alertMatch[0].length;
              const info = ALERT_INFO[alertMatch[1]!.toUpperCase()]!;
              marks.push({
                from: markerStart,
                to: markerEnd,
                deco: Decoration.replace({
                  widget: new (class extends WidgetType {
                    toDOM() {
                      const span = document.createElement("span");
                      span.textContent = info.label;
                      span.className = "cm-sop-alert-label";
                      return span;
                    }
                  })(),
                }),
              });
            }
            break;
          }
          default:
            break;
        }
      },
    });
  }

  // Lezer's iterate() visits nodes in document order, so `marks` is
  // already non-decreasing by `from` — except same-start nested ranges
  // (e.g. StrongEmphasis and its own opening EmphasisMark both start at
  // the same position), where the OUTER range must be added first. A
  // stable sort keyed on (from, then longer-range-first) guarantees that
  // without disturbing the otherwise-correct tree-walk order.
  marks.sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from));

  const lines: RawRange[] = Array.from(lineClasses.entries())
    .map(([lineNumber, classes]) => {
      const line = view.state.doc.line(lineNumber);
      return { from: line.from, to: line.from, deco: Decoration.line({ class: Array.from(classes).join(" ") }) };
    })
    .sort((a, b) => a.from - b.from);

  return { lines, marks };
}

function buildRangeSet(ranges: RawRange[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, deco } of ranges) builder.add(from, to, deco);
  return builder.finish();
}

const syntaxLinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildRangeSet(collectSyntaxRanges(view).lines);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildRangeSet(collectSyntaxRanges(update.view).lines);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

const syntaxMarkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildRangeSet(collectSyntaxRanges(view).marks);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildRangeSet(collectSyntaxRanges(update.view).marks);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

const liveMarkdownTheme = EditorView.baseTheme({
  "&": { height: "100%" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.7" },
  ".cm-content": { padding: "1rem 1.5rem" },
  ".cm-sop-marker": { opacity: "0.4" },
  ".cm-sop-h1": { fontSize: "1.5rem", fontWeight: "700" },
  ".cm-sop-h2": { fontSize: "1.25rem", fontWeight: "700" },
  ".cm-sop-h3": { fontSize: "1.1rem", fontWeight: "600" },
  ".cm-sop-h4": { fontWeight: "600" },
  ".cm-sop-h5": { fontWeight: "600" },
  ".cm-sop-h6": { fontWeight: "600" },
  ".cm-sop-strong": { fontWeight: "700" },
  ".cm-sop-em": { fontStyle: "italic" },
  ".cm-sop-strike": { textDecoration: "line-through" },
  ".cm-sop-code": {
    fontFamily: "'Courier New', ui-monospace, monospace",
    fontSize: "0.85em",
    borderRadius: "3px",
    padding: "0 3px",
  },
  ".cm-sop-blockquote": { paddingLeft: "0.6rem" },
  ".cm-sop-alert-label": { fontWeight: "700", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.02em" },
});

/** The full live-preview bundle: markdown parsing (with GFM), syntax styling, and {{key}} chip rendering — pass to `EditorState.create({ extensions: [...] })`. */
export function liveMarkdownExtensions(): Extension[] {
  return [
    markdown({ extensions: GFM }),
    liveVariablesField,
    variableChipPlugin,
    atomicVariableRanges,
    syntaxLinePlugin,
    syntaxMarkPlugin,
    liveMarkdownTheme,
  ];
}
