// Lector de PDF basado en pdf.js (Mozilla). Se carga a pedido para no
// engordar el arranque de la app.
import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";
import { escapeHtml } from "../../lib/util";
import { reflowFromChapters } from "../reflow";
import type { BookInfo, LoadedBook, PdfContent, ReflowContent, TocItem } from "../types";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;

export function getPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

const assetBase = () => `${import.meta.env.BASE_URL}pdfjs/`;

export async function openPdfDocument(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfJs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    cMapUrl: `${assetBase()}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetBase()}standard_fonts/`,
    wasmUrl: `${assetBase()}wasm/`,
    iccUrl: `${assetBase()}iccs/`,
    enableXfa: false,
  });
  return task.promise;
}

function looksLikeRealTitle(t: string | undefined): t is string {
  if (!t) return false;
  const s = t.trim();
  if (s.length < 2 || s.length > 200) return false;
  if (/^(untitled|sin t[ií]tulo|documento\d*|microsoft word|document\d*)/i.test(s)) return false;
  if (/\.(docx?|pdf|odt|rtf|txt|indd|qxd)$/i.test(s)) return false;
  return true;
}

/** Convierte el texto de una página PDF en párrafos legibles. */
export interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
  height?: number;
}

/**
 * Convierte el texto de una página PDF en párrafos legibles. Usa la posición
 * vertical de cada línea: un salto mayor que el interlineado habitual (o un
 * cambio de tamaño de letra, típico de los títulos) separa párrafos.
 */
export function itemsToParagraphs(items: PdfTextItem[]): string[] {
  const lines: { text: string; y: number | null; h: number }[] = [];
  let text = "";
  let y: number | null = null;
  let h = 0;
  for (const it of items) {
    if (y === null && it.transform && it.str.trim()) y = it.transform[5];
    if (it.str.trim()) h = Math.max(h, it.height ?? 0);
    text += it.str;
    if (it.hasEOL) {
      lines.push({ text, y, h });
      text = "";
      y = null;
      h = 0;
    }
  }
  if (text) lines.push({ text, y, h });

  const gaps: number[] = [];
  const heights: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1].y;
    const b = lines[i].y;
    if (a !== null && b !== null && a - b > 0) gaps.push(a - b);
  }
  for (const l of lines) if (l.h > 0 && l.text.trim()) heights.push(l.h);
  const quantile = (arr: number[], q: number) => (arr.length ? [...arr].sort((x, z) => x - z)[Math.floor(arr.length * q)] : 0);
  // El interlineado normal es el salto más frecuente: se toma uno de los menores.
  const typicalGap = quantile(gaps, 0.3);
  const typicalH = quantile(heights, 0.5);

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const prev = lines[i - 1];
    const big = typicalH > 0 && l.h > typicalH * 1.25;
    const prevBig = prev && typicalH > 0 && prev.h > typicalH * 1.25;
    if (prev && prev.y !== null && l.y !== null && typicalGap > 0) {
      const gap = prev.y - l.y;
      if (gap > typicalGap * 1.35 || gap < 0) out.push("");
    }
    if ((big && !prevBig) || (!big && prevBig)) out.push("");
    out.push(l.text);
  }
  return linesToParagraphs(out);
}

export function linesToParagraphs(rawLines: string[]): string[] {
  const lines = rawLines.map((l) => l.replace(/\s+/g, " ").trim());
  const lengths = lines.filter(Boolean).map((l) => l.length).sort((a, b) => a - b);
  const typical = lengths.length ? lengths[Math.floor(lengths.length * 0.75)] : 60;
  const paragraphs: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) paragraphs.push(cur.trim());
    cur = "";
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) {
      flush();
      continue;
    }
    if (cur.endsWith("-") && /^\p{Ll}/u.test(l)) cur = cur.slice(0, -1) + l;
    else cur = cur ? `${cur} ${l}` : l;
    const short = l.length < typical * 0.72;
    const endsSentence = /[.!?:»”"…)]$/.test(l);
    if (short && (endsSentence || l.length < 40)) flush();
  }
  flush();
  return paragraphs;
}

async function resolveOutline(doc: PDFDocumentProxy): Promise<TocItem[]> {
  const outline = await doc.getOutline().catch(() => null);
  if (!outline) return [];
  const items: TocItem[] = [];
  const walk = async (nodes: typeof outline, level: number) => {
    for (const node of nodes) {
      let page: number | null = null;
      try {
        const dest = typeof node.dest === "string" ? await doc.getDestination(node.dest) : node.dest;
        const ref = Array.isArray(dest) ? dest[0] : null;
        if (ref && typeof ref === "object") page = await doc.getPageIndex(ref);
        else if (typeof ref === "number") page = ref;
      } catch {
        page = null;
      }
      if (page !== null && node.title) items.push({ title: node.title.trim(), chapter: page, level });
      if (node.items?.length) await walk(node.items, level + 1);
    }
  };
  await walk(outline, 0);
  return items;
}

export async function renderPdfCover(doc: PDFDocumentProxy, width = 420): Promise<Blob | undefined> {
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    page.cleanup();
    return await new Promise<Blob | undefined>((res) => canvas.toBlob((b) => res(b ?? undefined), "image/jpeg", 0.85));
  } catch {
    return undefined;
  }
}

export async function loadPdf(data: ArrayBuffer, withCover = false): Promise<LoadedBook> {
  const doc = await openPdfDocument(data);
  const info: BookInfo = {};
  try {
    const meta = await doc.getMetadata();
    const i = meta.info as Record<string, unknown>;
    if (looksLikeRealTitle(i?.Title as string)) info.title = String(i.Title).trim();
    if (typeof i?.Author === "string" && i.Author.trim()) info.author = i.Author.trim();
    if (typeof i?.Subject === "string" && i.Subject.trim()) info.description = i.Subject.trim();
  } catch {
    /* sin metadatos */
  }
  if (withCover) info.cover = await renderPdfCover(doc);

  const toc = await resolveOutline(doc);
  const texts = new Map<number, string[]>();
  const pageParagraphs = async (page: number): Promise<string[]> => {
    if (texts.has(page)) return texts.get(page)!;
    try {
      const p = await doc.getPage(page + 1);
      const tc = await p.getTextContent();
      const paras = itemsToParagraphs(tc.items.filter((it): it is TextItem => "str" in it) as PdfTextItem[]);
      texts.set(page, paras);
      return paras;
    } catch {
      return [];
    }
  };

  let reflow: ReflowContent | null = null;
  const content: PdfContent = {
    kind: "pdf",
    doc,
    numPages: doc.numPages,
    toc,
    async getText(page) {
      return (await pageParagraphs(page)).join("\n\n");
    },
    asReflow() {
      if (reflow) return reflow;
      const base = reflowFromChapters([], {});
      reflow = {
        ...base,
        chapters: Array.from({ length: doc.numPages }, (_, i) => ({ title: `Página ${i + 1}`, size: 1 })),
        toc: toc.length ? toc : Array.from({ length: doc.numPages }, (_, i) => ({ title: `Página ${i + 1}`, chapter: i, level: 0 })),
        async getHtml(i) {
          const paras = await pageParagraphs(i);
          if (!paras.length) return `<p data-a="c"><em>(Página ${i + 1} sin texto: puede ser una imagen escaneada. Usa el modo páginas para verla.)</em></p>`;
          return paras.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
        },
        async getText(i) {
          return (await pageParagraphs(i)).join("\n\n");
        },
        resolveHref: () => null,
        dispose() {},
      };
      return reflow;
    },
    dispose() {
      void doc.loadingTask.destroy();
    },
  };
  return { content, info };
}
