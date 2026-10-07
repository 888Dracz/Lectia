// Modelo de datos de los libros y de su contenido ya interpretado.
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

export type BookFormat = "epub" | "pdf" | "docx" | "txt" | "md" | "html" | "fb2" | "cbz" | "mobi";

export const FORMAT_LABEL: Record<BookFormat, string> = {
  epub: "EPUB",
  pdf: "PDF",
  docx: "Word",
  txt: "TXT",
  md: "Markdown",
  html: "HTML",
  fb2: "FB2",
  cbz: "Cómic",
  mobi: "Kindle",
};

/**
 * Posición de lectura.
 * - Libros "fluidos" (EPUB, Word, TXT…): `chapter` es el índice del capítulo y
 *   `fraction` cuánto se avanzó dentro de él (0–1).
 * - PDF: `chapter` es el índice de página (base 0).
 */
export interface ReadingLocation {
  chapter: number;
  fraction: number;
  /** Avance global 0–1 (para mostrar). */
  percent: number;
  updatedAt: number;
}

export type BookStatus = "unread" | "reading" | "finished";

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  fileName: string;
  fileSize: number;
  hasCover: boolean;
  /** Cambia cuando se reemplaza la portada (para refrescarla). */
  coverRev?: number;
  addedAt: number;
  lastOpenedAt?: number;
  finishedAt?: number;
  status: BookStatus;
  favorite: boolean;
  collections: string[];
  location?: ReadingLocation;
  readingMs: number;
  wordCount?: number;
  charCount?: number;
  /** Historial de lectura por día (clave AAAA-MM-DD). */
  history?: Record<string, { ms: number; from: number; to: number }>;
  chapterCount?: number;
  description?: string;
  language?: string;
  /** Solo PDF: ver como páginas o como texto adaptable. */
  pdfMode?: "pages" | "text";
  /** Libro de muestra incluido con la app. */
  sample?: boolean;
}

export interface TocItem {
  title: string;
  chapter: number;
  anchor?: string;
  level: number;
}

export interface ChapterInfo {
  title: string;
  /** Peso relativo del capítulo (caracteres o bytes) para calcular el %. */
  size: number;
}

/** Contenido adaptable (texto que fluye y se pagina en pantalla). */
export interface ReflowContent {
  kind: "reflow";
  chapters: ChapterInfo[];
  toc: TocItem[];
  /** Cómics: cada capítulo es una imagen a pantalla completa. */
  fixedLayout?: boolean;
  getHtml(index: number): Promise<string>;
  getText(index: number): Promise<string>;
  resolveHref?(href: string, fromChapter: number): { chapter: number; anchor?: string } | null;
  dispose(): void;
}

export interface PdfContent {
  kind: "pdf";
  doc: PDFDocumentProxy;
  numPages: number;
  toc: TocItem[];
  getText(page: number): Promise<string>;
  /** Vista de texto adaptable: un capítulo por página. */
  asReflow(): ReflowContent;
  dispose(): void;
}

export type BookContent = ReflowContent | PdfContent;

/** Datos que se obtienen al importar un archivo. */
export interface BookInfo {
  title?: string;
  author?: string;
  cover?: Blob;
  description?: string;
  language?: string;
}

export interface LoadedBook {
  content: BookContent;
  info: BookInfo;
}

export function chapterCount(content: BookContent): number {
  return content.kind === "pdf" ? content.numPages : content.chapters.length;
}

/** Calcula el avance global (0–1) de una posición. */
export function globalPercent(content: BookContent, chapter: number, fraction: number): number {
  if (content.kind === "pdf") {
    return content.numPages ? Math.min(1, (chapter + fraction) / content.numPages) : 0;
  }
  return percentFromSizes(
    content.chapters.map((c) => c.size),
    chapter,
    fraction
  );
}

export function percentFromSizes(sizes: number[], chapter: number, fraction: number): number {
  const total = sizes.reduce((a, b) => a + Math.max(1, b), 0);
  if (!total) return 0;
  let before = 0;
  for (let i = 0; i < chapter && i < sizes.length; i++) before += Math.max(1, sizes[i]);
  const cur = Math.max(1, sizes[chapter] ?? 1);
  return Math.min(1, Math.max(0, (before + cur * fraction) / total));
}

/** Inversa de `percentFromSizes`: de un % global a capítulo + fracción. */
export function locationFromPercent(sizes: number[], percent: number): { chapter: number; fraction: number } {
  const total = sizes.reduce((a, b) => a + Math.max(1, b), 0);
  let target = Math.min(1, Math.max(0, percent)) * total;
  for (let i = 0; i < sizes.length; i++) {
    const s = Math.max(1, sizes[i]);
    if (target <= s || i === sizes.length - 1) {
      return { chapter: i, fraction: Math.min(0.9999, Math.max(0, target / s)) };
    }
    target -= s;
  }
  return { chapter: 0, fraction: 0 };
}

export function chapterSizes(content: BookContent): number[] {
  return content.kind === "pdf"
    ? Array.from({ length: content.numPages }, () => 1)
    : content.chapters.map((c) => c.size);
}
