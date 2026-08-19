import { docxToMarkdown } from "@/lib/sop/docxToMarkdown";

/**
 * Reads a local file as text, routing .docx through the same mammoth-based
 * converter Import already uses instead of dumping its raw zip bytes.
 * Shared by Import and the "attach reference files" feature — both need
 * "give me this file's real text content" with the same .docx handling.
 */
export async function readFileAsText(file: File): Promise<string> {
  const isDocx =
    /\.docx$/i.test(file.name) ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return isDocx ? docxToMarkdown(file) : file.text();
}
