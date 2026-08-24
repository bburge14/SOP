// Converts the rendered SOP markdown into a real .docx — proper Word
// headings/lists/tables/bold/code formatting, not just text dumped into a
// single style. Runs entirely client-side (browser), matching how
// Export .md and Export PDF already work: no server round-trip, nothing
// leaves the machine that isn't already visible in the preview.
//
// Parses via the same remark/unified stack `react-markdown` uses for the
// live preview (unified + remark-parse + remark-gfm), so heading levels,
// GFM tables, and list structure match what's actually rendered on screen
// — this is a separate AST walk, not a reimplementation of a markdown
// parser.
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import {
  Document,
  Paragraph,
  TextRun,
  ImageRun,
  ExternalHyperlink,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  BorderStyle,
  Packer,
  type IImageOptions,
  type IRunOptions,
} from "docx";

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

const MAX_IMAGE_WIDTH_PX = 550; // fits inside a Letter page's content area with 1" margins

const CODE_SHADING = { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" } as const;

// Same amber "needs attention" treatment as the live preview's
// .unbound-placeholder (and its @media print override in globals.css) —
// exported files should flag an unfilled {{key}} the same way the app
// itself does, not render it as plain, easy-to-miss text.
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
const UNFILLED_PLACEHOLDER_SHADING = { type: ShadingType.CLEAR, fill: "FEF3C7", color: "auto" } as const;
const UNFILLED_PLACEHOLDER_COLOR = "92400E";

// Named Word styles (not just direct formatting) for inline code, code
// blocks, and blockquotes. Word's direct formatting (a run's font/shading
// with no named style) is invisible to a generic docx reader — there's no
// semantic marker saying "this is code," just visual properties. Naming
// these styles lets docxToMarkdown.ts's mammoth styleMap recognize them by
// name and convert back to backtick/fence/`>` markdown instead of degrading
// to plain paragraphs, which is what a round trip through Import needs.
const INLINE_CODE_STYLE_ID = "SopInlineCode";
const INLINE_CODE_STYLE_NAME = "SOP Inline Code";
const CODE_BLOCK_STYLE_ID = "SopCodeBlock";
const CODE_BLOCK_STYLE_NAME = "SOP Code Block";
const BLOCKQUOTE_STYLE_ID = "SopBlockquote";
const BLOCKQUOTE_STYLE_NAME = "SOP Blockquote";

// GitHub-style alert blockquotes (`> [!WARNING]` etc.) get a colored label
// + border instead of the plain blockquote treatment, mirroring the
// preview's remarkGithubAlerts.ts — so a document handed to someone as a
// .docx still visually flags "this is an unverified assumption, not
// confirmed fact" rather than reading like an ordinary note once exported.
// Doesn't round-trip back through docxToMarkdown.ts (re-importing degrades
// this to a plain blockquote, losing the [!TYPE] marker) — a bounded,
// accepted gap rather than something this pass also solves.
const ALERT_LABELS: Record<string, { label: string; color: string }> = {
  WARNING: { label: "⚠ UNVERIFIED — CHECK BEFORE RELYING ON THIS", color: "B45309" },
  CAUTION: { label: "⚠ CAUTION", color: "B91C1C" },
  IMPORTANT: { label: "❗ IMPORTANT", color: "4338CA" },
  NOTE: { label: "ℹ NOTE", color: "1D4ED8" },
  TIP: { label: "💡 TIP", color: "047857" },
};

interface LoadedImage {
  type: "png" | "jpg" | "gif" | "bmp";
  data: Uint8Array;
  width: number;
  height: number;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function mimeToImageType(mime: string): LoadedImage["type"] | null {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("bmp")) return "bmp";
  return null;
}

function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => reject(new Error("could not decode image"));
    img.src = src;
  });
}

function scaleToMaxWidth(width: number, height: number): { width: number; height: number } {
  if (width <= MAX_IMAGE_WIDTH_PX) return { width, height };
  const ratio = MAX_IMAGE_WIDTH_PX / width;
  return { width: MAX_IMAGE_WIDTH_PX, height: Math.round(height * ratio) };
}

/** Returns null (rather than throwing) on any failure — a broken image shouldn't fail the whole export. */
async function loadImage(url: string): Promise<LoadedImage | null> {
  try {
    let data: Uint8Array;
    let type: LoadedImage["type"] | null;

    const dataUriMatch = /^data:([^;]+);base64,(.+)$/s.exec(url);
    if (dataUriMatch) {
      type = mimeToImageType(dataUriMatch[1]!);
      data = base64ToUint8Array(dataUriMatch[2]!);
    } else if (/^https?:\/\//.test(url)) {
      const res = await fetch(url);
      if (!res.ok) return null;
      const contentType = res.headers.get("content-type") || "";
      type = mimeToImageType(contentType) || mimeToImageType(url);
      data = new Uint8Array(await res.arrayBuffer());
    } else {
      return null; // unsupported scheme (e.g. a relative path with nothing to resolve against)
    }

    if (!type) return null;

    const natural = await getImageDimensions(url);
    const { width, height } = scaleToMaxWidth(natural.width, natural.height);
    return { type, data, width, height };
  } catch {
    return null;
  }
}

// ---- mdast node shapes we handle (subset — deliberately not a full mdast typing dependency) ----
interface MdNode {
  type: string;
  children?: MdNode[];
  value?: string;
  depth?: number;
  ordered?: boolean;
  url?: string;
  alt?: string;
  lang?: string;
  align?: (string | null)[];
}

/**
 * Splits `value` on every {{key}} occurrence into plain runs (using
 * `base`) plus distinctly-styled runs for the placeholder itself — mirrors
 * remarkSubstituteVariables.ts's splitOnPlaceholders for the live preview,
 * reimplemented here since this file walks its own lightweight MdNode tree.
 * `renderTemplate` has already substituted every *filled* variable by the
 * time this runs, so any {{key}} still present is genuinely unfilled —
 * there's no values/variables lookup needed here, just the pattern itself.
 */
function splitPlaceholderRuns(value: string, base: Omit<IRunOptions, "text">): TextRun[] {
  const runs: TextRun[] = [];
  let lastIndex = 0;
  PLACEHOLDER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER_RE.exec(value))) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ ...base, text: value.slice(lastIndex, match.index) }));
    }
    runs.push(
      new TextRun({ ...base, text: match[0], color: UNFILLED_PLACEHOLDER_COLOR, shading: UNFILLED_PLACEHOLDER_SHADING })
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length || runs.length === 0) {
    runs.push(new TextRun({ ...base, text: value.slice(lastIndex) }));
  }
  return runs;
}

async function convertInline(nodes: MdNode[], marks: { bold?: boolean; italic?: boolean } = {}): Promise<
  (TextRun | ImageRun | ExternalHyperlink)[]
> {
  const runs: (TextRun | ImageRun | ExternalHyperlink)[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        runs.push(...splitPlaceholderRuns(node.value || "", { bold: marks.bold, italics: marks.italic }));
        break;
      case "strong":
        runs.push(...(await convertInline(node.children || [], { ...marks, bold: true })));
        break;
      case "emphasis":
        runs.push(...(await convertInline(node.children || [], { ...marks, italic: true })));
        break;
      case "inlineCode":
        runs.push(
          ...splitPlaceholderRuns(node.value || "", {
            style: INLINE_CODE_STYLE_ID,
            font: "Courier New",
            shading: CODE_SHADING,
          })
        );
        break;
      case "break":
        runs.push(new TextRun({ text: "", break: 1 }));
        break;
      case "link": {
        const children = await convertInline(node.children || [], marks);
        const textRuns = children.filter((c): c is TextRun => c instanceof TextRun);
        runs.push(
          new ExternalHyperlink({
            link: node.url || "#",
            children: textRuns.length ? textRuns : [new TextRun({ text: node.url || "" })],
          })
        );
        break;
      }
      case "image": {
        const loaded = node.url ? await loadImage(node.url) : null;
        if (loaded) {
          const imageOptions = {
            type: loaded.type,
            data: loaded.data,
            transformation: { width: loaded.width, height: loaded.height },
          } as IImageOptions;
          runs.push(new ImageRun(imageOptions));
        } else if (node.alt) {
          // Broken/unsupported image — degrade to its alt text rather than
          // silently dropping content or failing the whole export.
          runs.push(new TextRun({ text: `[image: ${node.alt}]`, italics: true }));
        }
        break;
      }
      default:
        if (node.children) runs.push(...(await convertInline(node.children, marks)));
    }
  }
  return runs;
}

async function convertListItems(items: MdNode[], ordered: boolean, level: number): Promise<Paragraph[]> {
  const paragraphs: Paragraph[] = [];
  for (const item of items) {
    for (const child of item.children || []) {
      if (child.type === "list") {
        paragraphs.push(...(await convertListItems(child.children || [], Boolean(child.ordered), level + 1)));
        continue;
      }
      const runs = await convertInline(child.children || [child]);
      paragraphs.push(
        new Paragraph({
          children: runs,
          bullet: ordered ? undefined : { level },
          numbering: ordered ? { reference: "sop-numbering", level } : undefined,
        })
      );
    }
  }
  return paragraphs;
}

async function convertTable(node: MdNode): Promise<Table> {
  const rows = node.children || [];
  const tableRows = await Promise.all(
    rows.map(async (row, rowIndex) => {
      const cells = row.children || [];
      const tableCells = await Promise.all(
        cells.map(async (cell) => {
          const runs = await convertInline(cell.children || []);
          return new TableCell({
            width: { size: Math.floor(100 / (cells.length || 1)), type: WidthType.PERCENTAGE },
            shading: rowIndex === 0 ? { type: ShadingType.CLEAR, fill: "E2E8F0", color: "auto" } : undefined,
            children: [new Paragraph({ children: runs })],
          });
        })
      );
      return new TableRow({ children: tableCells });
    })
  );
  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
    },
  });
}

/**
 * If `node` (a blockquote) opens with a `[!TYPE]` marker, strips it from
 * the AST in place and returns the matched type — same detection
 * remarkGithubAlerts.ts does for the live preview, reimplemented here since
 * this file walks its own lightweight MdNode tree rather than a full mdast
 * one.
 */
function extractAlertType(node: MdNode): string | null {
  const first = node.children?.[0];
  if (!first || first.type !== "paragraph") return null;
  const firstText = first.children?.[0];
  if (!firstText || firstText.type !== "text" || !firstText.value) return null;

  const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i.exec(firstText.value);
  if (!match) return null;

  const remainder = firstText.value.slice(match[0].length);
  if (remainder.trim()) {
    firstText.value = remainder.replace(/^\s+/, "");
  } else {
    first.children!.shift();
  }
  return match[1]!.toUpperCase();
}

async function convertBlock(node: MdNode): Promise<(Paragraph | Table)[]> {
  switch (node.type) {
    case "heading": {
      const level = Math.min(Math.max(node.depth || 1, 1), 6) - 1;
      return [new Paragraph({ heading: HEADING_LEVELS[level], children: await convertInline(node.children || []) })];
    }
    case "paragraph":
      return [new Paragraph({ children: await convertInline(node.children || []) })];
    case "list":
      return convertListItems(node.children || [], Boolean(node.ordered), 0);
    case "code": {
      const lines = (node.value || "").split("\n");
      return lines.map(
        (line) =>
          new Paragraph({
            style: CODE_BLOCK_STYLE_ID,
            children: splitPlaceholderRuns(line || " ", { font: "Courier New", shading: CODE_SHADING }),
          })
      );
    }
    case "blockquote": {
      const alertType = extractAlertType(node);
      const alertInfo = alertType ? ALERT_LABELS[alertType] : undefined;
      const borderColor = alertInfo?.color ?? "94A3B8";

      // Build these directly from inline runs rather than converting the
      // children generically and re-wrapping — Paragraph doesn't expose
      // its children back out, so there's no supported way to "add
      // styling" to an already-built Paragraph after the fact.
      const paragraphs: Paragraph[] = [];
      if (alertInfo) {
        paragraphs.push(
          new Paragraph({
            indent: { left: 720 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: borderColor, space: 8 } },
            children: [new TextRun({ text: alertInfo.label, bold: true, color: alertInfo.color })],
          })
        );
      }
      for (const child of node.children || []) {
        if (child.type === "paragraph") {
          // extractAlertType may have emptied the marker-only first
          // paragraph (the typical case, since the marker is its own line)
          // — skip it rather than emitting a blank paragraph.
          if ((child.children?.length ?? 0) === 0) continue;
          paragraphs.push(
            new Paragraph({
              style: BLOCKQUOTE_STYLE_ID,
              children: await convertInline(child.children || []),
              indent: { left: 720 },
              border: { left: { style: BorderStyle.SINGLE, size: 12, color: borderColor, space: 8 } },
            })
          );
        } else {
          const nested = await convertBlock(child);
          paragraphs.push(...nested.filter((n): n is Paragraph => n instanceof Paragraph));
        }
      }
      return paragraphs;
    }
    case "thematicBreak":
      return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" } } })];
    case "table":
      return [await convertTable(node)];
    default:
      if (node.children) {
        const nested = await Promise.all(node.children.map(convertBlock));
        return nested.flat();
      }
      return [];
  }
}

/** Builds the .docx and returns it as a Blob ready for `URL.createObjectURL`. */
export async function markdownToDocxBlob(title: string, markdown: string): Promise<Blob> {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as unknown as MdNode;
  const blocks = await Promise.all((tree.children || []).map(convertBlock));

  const doc = new Document({
    title,
    styles: {
      // Base document font (Arial) and spacing — headings get real space
      // before them so sections read as visually distinct blocks instead
      // of running together, and body paragraphs get a little space after
      // so consecutive steps don't look glued to each other. Heading
      // levels 1-3 cover this app's actual output (document title, then
      // numbered "## N. Section" headings); 4-6 are set for completeness
      // in case a hand-edited or imported document goes deeper.
      // docx's own heading defaults (DefaultStylesFactory) bake in a
      // `size`/`color` per level — e.g. Heading1 is `{ color: "2E74B5",
      // size: 32 }` — that's what actually gives headings visual hierarchy
      // in the exported file; the "Heading 1"/"Heading 2" style IDs alone
      // don't imply a size. These per-level overrides get shallow-merged
      // against that default at the `run`/`paragraph` key, not deep-merged
      // property-by-property — providing `run: { font: "Arial" }` alone
      // replaces the WHOLE default run object, silently dropping its size
      // and color and leaving every heading the same size as body text.
      // Reproduced live: a real export where "1. Purpose"/"2. Scope" came
      // back bold but visually flat, indistinguishable in size from a
      // normal paragraph. Fixed by re-stating each level's own default
      // size/color explicitly alongside the Arial/spacing additions.
      default: {
        document: {
          run: { font: "Arial" },
          paragraph: { spacing: { after: 200 } },
        },
        heading1: {
          run: { font: "Arial", bold: true, color: "2E74B5", size: 32 },
          paragraph: { spacing: { before: 360, after: 160 } },
        },
        heading2: {
          run: { font: "Arial", bold: true, color: "2E74B5", size: 26 },
          paragraph: { spacing: { before: 360, after: 160 } },
        },
        heading3: {
          run: { font: "Arial", bold: true, color: "1F4D78", size: 24 },
          paragraph: { spacing: { before: 280, after: 120 } },
        },
        heading4: {
          run: { font: "Arial", bold: true, color: "2E74B5", italics: true },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
        heading5: {
          run: { font: "Arial", bold: true, color: "2E74B5" },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
        heading6: {
          run: { font: "Arial", bold: true, color: "1F4D78" },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
      },
      characterStyles: [
        {
          id: INLINE_CODE_STYLE_ID,
          name: INLINE_CODE_STYLE_NAME,
          basedOn: "Normal",
          run: { font: "Courier New", shading: CODE_SHADING },
        },
      ],
      paragraphStyles: [
        {
          id: CODE_BLOCK_STYLE_ID,
          name: CODE_BLOCK_STYLE_NAME,
          basedOn: "Normal",
          run: { font: "Courier New" },
          paragraph: { shading: CODE_SHADING },
        },
        {
          id: BLOCKQUOTE_STYLE_ID,
          name: BLOCKQUOTE_STYLE_NAME,
          basedOn: "Normal",
          paragraph: {
            indent: { left: 720 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: "94A3B8", space: 8 } },
          },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "sop-numbering",
          levels: [
            { level: 0, format: "decimal", text: "%1.", alignment: "start" },
            { level: 1, format: "lowerLetter", text: "%2.", alignment: "start" },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {},
        // No separate visible title paragraph here — the rendered markdown
        // already carries its own heading structure (matching what the
        // preview/PDF show), and generated SOPs consistently open with
        // their own H1. Adding one unconditionally produced a duplicate
        // title, caught by inspecting a real exported .docx's XML.
        children: blocks.flat(),
      },
    ],
  });

  return Packer.toBlob(doc);
}
