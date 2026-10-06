// Detecta el formato de un archivo y lo interpreta con el lector adecuado.
import { getFile } from "../lib/db";
import { baseName, extension } from "../lib/util";
import type { BookContent, BookFormat, BookMeta, LoadedBook } from "./types";

const BY_EXT: Record<string, BookFormat> = {
  epub: "epub",
  pdf: "pdf",
  docx: "docx",
  txt: "txt",
  text: "txt",
  md: "md",
  markdown: "md",
  html: "html",
  htm: "html",
  xhtml: "html",
  fb2: "fb2",
  cbz: "cbz",
};

export const SUPPORTED_EXTENSIONS = Object.keys(BY_EXT);

export class UnsupportedFormatError extends Error {}

export async function detectFormat(file: Blob & { name?: string }): Promise<BookFormat> {
  const ext = extension(file.name ?? "");
  if (ext === "doc") throw new UnsupportedFormatError("Los .doc antiguos no se pueden abrir: guárdalo como .docx desde Word.");
  if (ext === "mobi" || ext === "azw" || ext === "azw3")
    throw new UnsupportedFormatError("Los libros de Kindle (MOBI/AZW) no se pueden abrir: conviértelos a EPUB (por ejemplo con Calibre).");
  if (BY_EXT[ext]) return BY_EXT[ext];
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const ascii = String.fromCharCode(...head);
  if (ascii.startsWith("%PDF")) return "pdf";
  if (ascii.startsWith("PK")) {
    if (ascii.includes("mimetypeapplication/epub+zip")) return "epub";
    if (ascii.includes("[Content_Types].xml") || ascii.includes("word/")) return "docx";
  }
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "application/epub+zip") return "epub";
  if (file.type.startsWith("text/plain")) return "txt";
  if (file.type.startsWith("text/html")) return "html";
  throw new UnsupportedFormatError(`Formato no compatible${ext ? ` (.${ext})` : ""}.`);
}

export async function loadBookData(format: BookFormat, data: ArrayBuffer, fileName: string, withCover = false): Promise<LoadedBook> {
  const title = baseName(fileName);
  switch (format) {
    case "epub":
      return (await import("./formats/epub")).loadEpub(data);
    case "pdf":
      return (await import("./formats/pdf")).loadPdf(data, withCover);
    case "docx":
      return (await import("./formats/docx")).loadDocx(data, title);
    case "txt":
      return (await import("./formats/text")).loadTxt(data, title);
    case "md":
      return (await import("./formats/text")).loadMarkdown(data, title);
    case "html":
      return (await import("./formats/htmlbook")).loadHtml(data, title);
    case "fb2":
      return (await import("./formats/fb2")).loadFb2(data, title);
    case "cbz":
      return (await import("./formats/cbz")).loadCbz(data);
  }
}

// Caché del último libro abierto: volver al lector (o pasar del lector a un
// minijuego con ese libro) no vuelve a interpretar el archivo.
let cached: { id: string; content: BookContent } | null = null;

export async function openBookContent(meta: BookMeta): Promise<BookContent> {
  if (cached?.id === meta.id) return cached.content;
  const blob = await getFile(meta.id);
  if (!blob) throw new Error("No se encontró el archivo del libro en este dispositivo.");
  const { content } = await loadBookData(meta.format, await blob.arrayBuffer(), meta.fileName);
  if (cached) cached.content.dispose();
  cached = { id: meta.id, content };
  return content;
}

export function forgetBookContent(id: string) {
  if (cached?.id === id) {
    cached.content.dispose();
    cached = null;
  }
}
