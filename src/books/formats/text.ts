// Texto plano (.txt) y Markdown (.md).
import { marked } from "marked";
import { escapeHtml } from "../../lib/util";
import { sanitizeHtml, splitHtmlIntoChapters, type HtmlChapter } from "../html";
import { reflowFromChapters } from "../reflow";
import type { BookInfo, LoadedBook } from "../types";

/** Decodifica bytes de texto: UTF-8, UTF-16 con BOM o Windows-1252 (Latin-1). */
export function decodeText(data: ArrayBuffer, declared?: string): string {
  const bytes = new Uint8Array(data);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  if (declared) {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      /* codificación desconocida */
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const HEADING_RE =
  /^(cap[ií]tulo|chapter|parte|part|libro|book|pr[oó]logo|prologue|ep[ií]logo|epilogue|introducci[oó]n|prefacio|pref[aá]cio|acto|canto|tratado)\b[\s\S]{0,70}$/i;
const ROMAN_RE = /^(?=[IVXLC])M*(C[MD]|D?C{0,3})(X[CL]|L?X{0,3})(I[XV]|V?I{0,3})\.?$/;

export function isTxtHeading(p: string): boolean {
  const s = p.trim();
  if (s.length > 80 || s.includes("\n")) return false;
  return HEADING_RE.test(s) || ROMAN_RE.test(s);
}

/** Divide texto plano en párrafos (respeta texto cortado a mano tipo Gutenberg). */
export function textToParagraphs(text: string): string[] {
  const t = text.replace(/\r\n?/g, "\n").replace(/\u000c/g, "\n");
  const hasBlank = /\n[ \t]*\n/.test(t);
  if (hasBlank) {
    return t
      .split(/\n[ \t]*\n+/)
      .map((p) => p.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }
  return t
    .split("\n")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const CHUNK = 40000;

export function paragraphsToChapters(paragraphs: string[], fallbackTitle: string): HtmlChapter[] {
  const headingIdx = paragraphs.map((p, i) => (isTxtHeading(p) ? i : -1)).filter((i) => i >= 0);
  const chapters: HtmlChapter[] = [];
  if (headingIdx.length >= 2) {
    const starts = headingIdx[0] > 0 ? [0, ...headingIdx] : headingIdx;
    starts.forEach((start, k) => {
      const end = starts[k + 1] ?? paragraphs.length;
      const chunk = paragraphs.slice(start, end);
      const first = chunk[0];
      const heading = isTxtHeading(first);
      chapters.push({
        title: heading ? first.slice(0, 80) : k === 0 ? "Inicio" : `Parte ${k + 1}`,
        html: chunk.map((p, j) => (j === 0 && heading ? `<h2>${escapeHtml(p)}</h2>` : `<p>${escapeHtml(p)}</p>`)).join("\n"),
      });
    });
    return chapters;
  }
  let cur: string[] = [];
  let size = 0;
  const push = () => {
    if (!cur.length) return;
    chapters.push({ title: chapters.length === 0 && size < CHUNK ? fallbackTitle : `Parte ${chapters.length + 1}`, html: cur.join("\n") });
    cur = [];
    size = 0;
  };
  for (const p of paragraphs) {
    cur.push(`<p>${escapeHtml(p)}</p>`);
    size += p.length;
    if (size > CHUNK) push();
  }
  push();
  if (chapters.length > 1 && chapters[0].title === fallbackTitle) chapters[0].title = "Parte 1";
  return chapters.length ? chapters : [{ title: fallbackTitle, html: "<p></p>" }];
}

export async function loadTxt(data: ArrayBuffer, fileTitle: string): Promise<LoadedBook> {
  const text = decodeText(data);
  const info: BookInfo = {};
  // Encabezado de Proyecto Gutenberg
  const title = /^\s*(?:Title|T[ií]tulo):\s*(.+)$/im.exec(text.slice(0, 3000));
  const author = /^\s*(?:Author|Autor):\s*(.+)$/im.exec(text.slice(0, 3000));
  if (title) info.title = title[1].trim();
  if (author) info.author = author[1].trim();
  const chapters = paragraphsToChapters(textToParagraphs(text), info.title ?? fileTitle);
  return { content: reflowFromChapters(chapters), info };
}

export async function loadMarkdown(data: ArrayBuffer, fileTitle: string): Promise<LoadedBook> {
  return markdownToBook(decodeText(data), fileTitle);
}

export function markdownToBook(md: string, fileTitle: string): LoadedBook {
  const html = sanitizeHtml(marked.parse(md, { async: false, gfm: true }) as string);
  const h1 = /^#\s+(.+)$/m.exec(md);
  const author = /^(?:>\s*)?(?:Autor|Author|Por):\s*(.+)$/im.exec(md.slice(0, 2000));
  const info: BookInfo = { title: h1?.[1].trim(), author: author?.[1].replace(/[*_]/g, "").trim() };
  return { content: reflowFromChapters(splitHtmlIntoChapters(html, info.title ?? fileTitle)), info };
}
