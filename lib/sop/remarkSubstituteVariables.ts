import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Root, Text, Parent } from "mdast";
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

  return function attacher() {
    return function transformer(tree: Root) {
      visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
        if (index === undefined || !parent) return;
        const value = node.value;
        PLACEHOLDER_RE.lastIndex = 0;
        if (!PLACEHOLDER_RE.test(value)) return;
        PLACEHOLDER_RE.lastIndex = 0;

        const newNodes: Text[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = PLACEHOLDER_RE.exec(value))) {
          const full = match[0];
          const key = match[1]!;
          if (match.index > lastIndex) {
            newNodes.push({ type: "text", value: value.slice(lastIndex, match.index) });
          }
          const hasValue = key in values;
          const raw = values[key];
          const substituted = hasValue ? (raw === undefined || raw === null ? "" : String(raw)) : full;
          const label = labelByKey.get(key);
          newNodes.push({
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
          } as Text);
          lastIndex = match.index + full.length;
        }
        if (lastIndex < value.length) {
          newNodes.push({ type: "text", value: value.slice(lastIndex) });
        }

        parent.children.splice(index, 1, ...newNodes);
        return index + newNodes.length;
      });
    };
  };
}
