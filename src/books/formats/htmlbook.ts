// Páginas HTML guardadas como libro.
import { preserveInlineFormatting, sanitizeHtml, splitHtmlIntoChapters } from "../html";
import { reflowFromChapters } from "../reflow";
import type { BookInfo, LoadedBook } from "../types";
import { decodeText } from "./text";

export async function loadHtml(data: ArrayBuffer, fileTitle: string): Promise<LoadedBook> {
  const head = new TextDecoder("ascii").decode(new Uint8Array(data).slice(0, 2048));
  const charset = /charset=["']?([\w-]+)/i.exec(head)?.[1];
  const doc = new DOMParser().parseFromString(decodeText(data, charset), "text/html");
  preserveInlineFormatting(doc);
  const info: BookInfo = {
    title: doc.querySelector("title")?.textContent?.trim() || doc.querySelector("h1")?.textContent?.trim() || undefined,
    author: doc.querySelector('meta[name="author"]')?.getAttribute("content")?.trim() || undefined,
    description: doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() || undefined,
  };
  const html = sanitizeHtml(doc.body?.innerHTML ?? "");
  return { content: reflowFromChapters(splitHtmlIntoChapters(html, info.title ?? fileTitle)), info };
}
