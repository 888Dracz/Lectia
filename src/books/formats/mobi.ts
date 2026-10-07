// Libros de Kindle: MOBI (6) y AZW3/KF8. Se lee la base de datos Palm, se
// descomprime el texto (PalmDOC) y se convierte el HTML de Kindle en capítulos.
// Los libros con DRM o con compresión HUFF/CDIC no se pueden abrir.
import { preserveInlineFormatting, sanitizeHtml, splitHtmlIntoChapters, type HtmlChapter } from "../html";
import { reflowFromChapters } from "../reflow";
import type { BookInfo, LoadedBook } from "../types";

const u16 = (d: DataView, o: number) => d.getUint16(o);
const u32 = (d: DataView, o: number) => d.getUint32(o);

/** Descompresión PalmDOC (LZ77 sencillo). */
export function palmDocDecompress(src: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i++];
    if (c === 0 || (c >= 9 && c <= 0x7f)) out.push(c);
    else if (c <= 8) {
      for (let k = 0; k < c && i < src.length; k++) out.push(src[i++]);
    } else if (c >= 0xc0) {
      out.push(32, c ^ 0x80);
    } else {
      const next = src[i++] ?? 0;
      const pair = (c << 8) | next;
      const dist = (pair >> 3) & 0x7ff;
      const len = (pair & 7) + 3;
      for (let k = 0; k < len; k++) out.push(dist > 0 && out.length >= dist ? out[out.length - dist] : 32);
    }
  }
  return Uint8Array.from(out);
}

/** Bytes extra al final de cada registro de texto (multibyte, índices…). */
export function trailingSize(rec: Uint8Array, flags: number): number {
  let size = 0;
  for (let bit = 15; bit >= 1; bit--) {
    if (!(flags & (1 << bit))) continue;
    let num = 0;
    let shift = 0;
    let pos = rec.length - size;
    for (let k = 0; k < 4 && pos > 0; k++) {
      const b = rec[--pos];
      num |= (b & 0x7f) << shift;
      shift += 7;
      if (b & 0x80) break;
    }
    size += num;
  }
  if (flags & 1 && rec.length - size - 1 >= 0) size += (rec[rec.length - size - 1] & 3) + 1;
  return Math.min(size, rec.length);
}

function imageType(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49) return "image/gif";
  if (b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  return null;
}

/** Índices de "kindle:embed:XXXX" (base 32, 0-9A-V). */
function base32(s: string): number {
  return parseInt(s, 32);
}

export async function loadMobi(data: ArrayBuffer, fileTitle: string): Promise<LoadedBook> {
  const bytes = new Uint8Array(data);
  const dv = new DataView(data);
  if (bytes.length < 86) throw new Error("El archivo de Kindle está dañado.");
  const type = String.fromCharCode(...bytes.slice(60, 68));
  if (!/BOOKMOBI|TEXtREAd/.test(type)) throw new Error("Este archivo no parece un libro de Kindle (MOBI/AZW3).");
  const numRecords = u16(dv, 76);
  const offsets: number[] = [];
  for (let i = 0; i < numRecords; i++) offsets.push(u32(dv, 78 + i * 8));
  offsets.push(bytes.length);
  const record = (i: number) => bytes.subarray(offsets[i], offsets[i + 1]);

  const parseHeader = (base: number) => {
    const r0 = record(base);
    const h = new DataView(r0.buffer, r0.byteOffset, r0.byteLength);
    const compression = u16(h, 0);
    const textRecords = u16(h, 8);
    const encryption = u16(h, 12);
    const isMobi = r0.length > 20 && String.fromCharCode(...r0.slice(16, 20)) === "MOBI";
    const headerLen = isMobi ? u32(h, 20) : 0;
    const encoding = isMobi ? u32(h, 28) : 1252;
    const version = isMobi ? u32(h, 36) : 0;
    const firstImage = isMobi && r0.length > 112 ? u32(h, 108) : 0xffffffff;
    const exthFlag = isMobi && r0.length > 132 ? u32(h, 128) : 0;
    const extraFlags = isMobi && headerLen >= 0xe4 && r0.length > 0xf4 ? u16(h, 0xf2) : 0;
    const exth = new Map<number, Uint8Array[]>();
    if (exthFlag & 0x40) {
      const start = 16 + headerLen;
      if (String.fromCharCode(...r0.slice(start, start + 4)) === "EXTH") {
        const count = u32(h, start + 8);
        let pos = start + 12;
        for (let k = 0; k < count && pos + 8 <= r0.length; k++) {
          const t = u32(h, pos);
          const len = u32(h, pos + 4);
          if (len < 8) break;
          const val = r0.slice(pos + 8, pos + len);
          exth.set(t, [...(exth.get(t) ?? []), val]);
          pos += len;
        }
      }
    }
    let fullName = "";
    if (isMobi && r0.length > 92) {
      const off = u32(h, 84);
      const len = u32(h, 88);
      fullName = new TextDecoder(encoding === 65001 ? "utf-8" : "windows-1252").decode(r0.slice(off, off + len));
    }
    return { compression, textRecords, encryption, encoding, version, firstImage, extraFlags, exth, fullName };
  };

  let base = 0;
  let hdr = parseHeader(0);
  // Archivos combinados (MOBI + KF8): se prefiere la parte KF8, más fiel.
  const boundary = hdr.exth.get(121)?.[0];
  if (boundary && boundary.length >= 4) {
    const idx = new DataView(boundary.buffer, boundary.byteOffset, 4).getUint32(0);
    if (idx > 0 && idx + 1 < numRecords) {
      try {
        const k = parseHeader(idx + 1);
        if (k.version >= 8) {
          base = idx + 1;
          hdr = { ...k, exth: k.exth.size ? k.exth : hdr.exth };
        }
      } catch {
        /* se queda con la parte MOBI */
      }
    }
  }
  if (hdr.encryption !== 0) throw new Error("Este libro de Kindle tiene DRM (protección anticopia) y no se puede abrir.");
  if (hdr.compression === 17480) throw new Error("Este libro de Kindle usa una compresión (HUFF/CDIC) no compatible. Conviértelo a EPUB con Calibre.");

  const chunks: Uint8Array[] = [];
  for (let i = 1; i <= hdr.textRecords && base + i < numRecords; i++) {
    let rec = record(base + i);
    rec = rec.subarray(0, rec.length - trailingSize(rec, hdr.extraFlags));
    chunks.push(hdr.compression === 2 ? palmDocDecompress(rec) : rec);
  }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const all = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    all.set(c, p);
    p += c.length;
  }
  let html = new TextDecoder(hdr.encoding === 65001 ? "utf-8" : "windows-1252").decode(all);

  const dec = (t: number) => {
    const v = hdr.exth.get(t)?.[0];
    return v ? new TextDecoder("utf-8").decode(v).trim() : undefined;
  };
  const info: BookInfo = {
    title: dec(503) || hdr.fullName || fileTitle,
    author: (hdr.exth.get(100) ?? []).map((v) => new TextDecoder().decode(v).trim()).filter(Boolean).join(", ") || undefined,
    description: dec(103)?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    language: dec(524),
  };

  // Imágenes: registros a partir de firstImage.
  const blobUrls = new Map<number, string>();
  const imageUrl = (n: number): string | null => {
    if (hdr.firstImage === 0xffffffff) return null;
    if (blobUrls.has(n)) return blobUrls.get(n)!;
    const idx = base + hdr.firstImage + n - 1;
    if (idx < 0 || idx >= numRecords) return null;
    const b = record(idx);
    const t = imageType(b);
    if (!t) return null;
    const url = URL.createObjectURL(new Blob([b.slice()], { type: t }));
    blobUrls.set(n, url);
    return url;
  };
  const coverOff = hdr.exth.get(201)?.[0];
  if (coverOff && coverOff.length >= 4 && hdr.firstImage !== 0xffffffff) {
    const n = new DataView(coverOff.buffer, coverOff.byteOffset, 4).getUint32(0);
    const idx = base + hdr.firstImage + n;
    if (idx < numRecords) {
      const b = record(idx);
      const t = imageType(b);
      if (t) info.cover = new Blob([b.slice()], { type: t });
    }
  }

  // HTML de Kindle → HTML normal.
  html = html
    .replace(/<img([^>]*?)\srecindex=["']?(\d+)["']?/gi, (_m, pre: string, n: string) => `<img${pre} src="img/${parseInt(n, 10)}"`)
    .replace(/kindle:embed:([0-9A-V]+)(\?[^"']*)?/gi, (_m, n: string) => `img/${base32(n)}`)
    .replace(/\sfilepos=["']?\d+["']?/gi, "")
    .replace(/<\/?mbp:[^>]*>/gi, (t) => (/pagebreak/i.test(t) ? "<hr data-pb-split>" : ""));

  // Capítulos: saltos de página MOBI o cada archivo KF8.
  const parts = html.split(/<hr data-pb-split>|(?=<html[\s>])/i).filter((s) => s.replace(/<[^>]+>/g, "").trim() || /<img/i.test(s));
  const resolveResource = (src: string) => {
    const m = /img\/(\d+)/.exec(src);
    return m ? imageUrl(parseInt(m[1], 10)) : null;
  };
  const clean = (raw: string) => {
    const doc = new DOMParser().parseFromString(raw, "text/html");
    preserveInlineFormatting(doc);
    return sanitizeHtml(doc.body.innerHTML, { resolveResource });
  };
  let chapters: HtmlChapter[] = parts.map((part, i) => {
    const h = clean(part);
    const title = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(h)?.[1].replace(/<[^>]+>/g, "").trim().slice(0, 90);
    return { title: title || (i === 0 ? "Inicio" : `Sección ${i + 1}`), html: h };
  });
  if (chapters.length <= 1) chapters = splitHtmlIntoChapters(chapters[0]?.html ?? clean(html), info.title ?? fileTitle);
  const content = reflowFromChapters(chapters, {
    onDispose: () => {
      for (const u of blobUrls.values()) URL.revokeObjectURL(u);
      blobUrls.clear();
    },
  });
  return { content, info };
}
