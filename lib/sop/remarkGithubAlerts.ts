import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Blockquote, Paragraph, Root, Text } from "mdast";

const ALERT_TYPES = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] as const;
const ALERT_RE = new RegExp(`^\\[!(${ALERT_TYPES.join("|")})\\]\\s*`, "i");

/**
 * Renders GitHub-style alert blockquotes (`> [!WARNING]` etc.) as distinctly
 * styled callouts instead of plain blockquotes. Used for the "AI is
 * inferring rather than confirming a fact" markers SOP_SYSTEM_PROMPT and
 * REVIEW_IMPROVE_SYSTEM_PROMPT are instructed to emit — an `> [!WARNING]`
 * flagging an unverified assumption needs to visually stand apart from an
 * ordinary note, not blend into the same italic-grey blockquote styling.
 * Adopted this specific syntax (rather than inventing one) because it's an
 * existing, widely-recognized convention models are already likely to
 * produce correctly when asked for it.
 */
export const remarkGithubAlerts: Plugin<[], Root> = () => (tree: Root) => {
  visit(tree, "blockquote", (node: Blockquote) => {
    const first = node.children[0];
    if (!first || first.type !== "paragraph") return;
    const firstText = (first as Paragraph).children[0];
    if (!firstText || firstText.type !== "text") return;

    const match = ALERT_RE.exec(firstText.value);
    if (!match) return;
    const alertType = match[1]!.toUpperCase();

    const remainder = (firstText as Text).value.slice(match[0].length);
    if (remainder.trim()) {
      (firstText as Text).value = remainder.replace(/^\s+/, "");
    } else {
      // The marker was the whole first text node (the typical case, since
      // prompts are instructed to put "[!WARNING]" on its own line) — drop
      // it and a following soft-break so no empty line is left behind.
      (first as Paragraph).children.shift();
      if ((first as Paragraph).children[0]?.type === "break") {
        (first as Paragraph).children.shift();
      }
    }

    node.data = {
      ...node.data,
      hName: "div",
      hProperties: {
        className: ["sop-alert", `sop-alert-${alertType.toLowerCase()}`],
        "data-alert-type": alertType,
      },
    };
  });
};
