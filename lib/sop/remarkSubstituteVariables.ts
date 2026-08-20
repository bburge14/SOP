import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Root, Text, InlineCode, Parent } from "mdast";
import type { SopVariable, VariableValues } from "@/types/sop";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Substitutes {{key}} placeholders at the mdast level (not via a pre-pass
 * string replace) so the hover-to-highlight feature has something to target:
 * each substituted span gets tagged with data-sop-var + a title tooltip via
 * mdast-util-to-hast's data.hName/hProperties convention. This intentionally
 * avoids raw HTML injection (no rehype-raw) — field values are user/import
 * controlled, so building actual DOM elements through the AST instead of
 * parsing an HTML string keeps this safe from injection.
 */
export function remarkSubstituteVariables(values: VariableValues, variables: SopVariable[]): Plugin<[], Root> {
  const labelByKey = new Map(variables.map((v) => [v.key, v.label]));

  function substitutedTextNode(key: string, fullMatch: string): Text {
    const hasValue = key in values;
    const raw = values[key];
    const substituted = hasValue ? (raw === undefined || raw === null ? "" : String(raw)) : fullMatch;
    const label = labelByKey.get(key);
    return {
      type: "text",
      value: substituted,
      data: {
        hName: "span",
        hProperties: {
          "data-sop-var": key,
          title: label ? `Field: ${label}` : `Field: ${key}`,
          className: ["sop-var-value"],
        },
      },
    } as Text;
  }

  /**
   * Splits `value` on every {{key}} occurrence into substituted spans plus
   * the literal text between them. `wrapLiteralAsCode` keeps the
   * non-placeholder portions looking like inline code — used when the
   * source was a backtick code span (`` `prefix-{{key}}` ``), so the parts
   * that really are literal code don't lose their styling just because a
   * variable happened to be embedded in the same span.
   */
  function splitOnPlaceholders(value: string, wrapLiteralAsCode: boolean): Text[] {
    const nodes: Text[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((match = PLACEHOLDER_RE.exec(value))) {
      const full = match[0];
      const key = match[1]!;
      if (match.index > lastIndex) {
        const literal = value.slice(lastIndex, match.index);
        nodes.push(
          wrapLiteralAsCode ? ({ type: "text", value: literal, data: { hName: "code" } } as Text) : { type: "text", value: literal }
        );
      }
      nodes.push(substitutedTextNode(key, full));
      lastIndex = match.index + full.length;
    }
    if (lastIndex < value.length) {
      const literal = value.slice(lastIndex);
      nodes.push(
        wrapLiteralAsCode ? ({ type: "text", value: literal, data: { hName: "code" } } as Text) : { type: "text", value: literal }
      );
    }
    return nodes;
  }

  return function attacher() {
    return function transformer(tree: Root) {
      visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
        if (index === undefined || !parent) return;
        PLACEHOLDER_RE.lastIndex = 0;
        if (!PLACEHOLDER_RE.test(node.value)) return;

        const newNodes = splitOnPlaceholders(node.value, false);
        parent.children.splice(index, 1, ...newNodes);
        return index + newNodes.length;
      });

      // A generated SOP wrapping a placeholder in backticks — `{{key}}` —
      // is common (models reach for code styling on anything that looks
      // like a technical value) and parses as a completely separate
      // "inlineCode" node type, whose raw string content the "text" visitor
      // above never sees. Left unhandled, those specific occurrences stayed
      // permanently literal ({{key}} text in a code box) — never
      // substituted with the real field value and not part of
      // hover-to-locate — while identical variables elsewhere in the same
      // document worked fine. Reported live from a real generated SOP
      // where every {{...}} happened to be backtick-wrapped, so nothing in
      // it was actually editable.
      visit(tree, "inlineCode", (node: InlineCode, index, parent: Parent | undefined) => {
        if (index === undefined || !parent) return;
        PLACEHOLDER_RE.lastIndex = 0;
        if (!PLACEHOLDER_RE.test(node.value)) return;

        const newNodes = splitOnPlaceholders(node.value, true);
        parent.children.splice(index, 1, ...newNodes);
        return index + newNodes.length;
      });
    };
  };
}
