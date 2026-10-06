// Lector de EPUB (2 y 3). Se descomprime con fflate y se interpreta el OPF,
// el índice (nav.xhtml o toc.ncx) y cada capítulo del "spine".
import { strFromU8, unzipSync } from "fflate";
import { htmlToText, preserveInlineFormatting, sanitizeHtml } from "../html";
import type { BookInfo, LoadedBook, ReflowContent, TocItem } from "../types";

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i + 1) : "";
}

/** Resuelve una ruta relativa (con "..", "." y %xx) respecto de una carpeta. */
export function resolvePath(baseDir: string, href: string): string {
  const clean = href.split("#")[0].split("?")[0];
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    /* ruta con % sueltos */
  }
  const parts = (decoded.startsWith("/") ? decoded.slice(1) : baseDir + decoded).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    return new DOMParser().parseFromString(text, "text/html");
  }
  return doc;
}

/** Busca elementos por nombre local, ignorando prefijos de espacio de nombres. */
function byLocalName(root: Document | Element, name: string): Element[] {
  const all = root.getElementsByTagName("*");
  const out: Element[] = [];
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if ((el.localName || el.nodeName).toLowerCase().replace(/^.*:/, "") === name) out.push(el);
  }
  return out;
}

function childrenByLocalName(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => (c.localName || c.nodeName).toLowerCase().replace(/^.*:/, "") === name);
}

interface ManifestItem {
  id: string;
  path: string;
  type: string;
  properties: string;
}

export async function loadEpub(data: ArrayBuffer): Promise<LoadedBook> {
  const zip = unzipSync(new Uint8Array(data));
  const lower = new Map<string, string>();
  for (const name of Object.keys(zip)) lower.set(name.toLowerCase(), name);
  const getEntry = (path: string): Uint8Array | undefined => {
    if (zip[path]) return zip[path];
    const alt = lower.get(path.toLowerCase());
    return alt ? zip[alt] : undefined;
  };
  const readText = (path: string): string | null => {
    const bytes = getEntry(path);
    return bytes ? strFromU8(bytes) : null;
  };

  const containerXml = readText("META-INF/container.xml");
  let opfPath = "";
  if (containerXml) {
    const rootfile = byLocalName(parseXml(containerXml), "rootfile")[0];
    opfPath = rootfile?.getAttribute("full-path") ?? "";
  }
  if (!opfPath || !getEntry(opfPath)) {
    opfPath = Object.keys(zip).find((n) => n.toLowerCase().endsWith(".opf")) ?? "";
  }
  if (!opfPath) throw new Error("El EPUB no tiene un archivo OPF válido.");
  const opfDir = dirname(opfPath);
  const opf = parseXml(readText(opfPath) ?? "");

  // Metadatos
  const metaText = (name: string) => byLocalName(opf, name)[0]?.textContent?.trim() || undefined;
  const info: BookInfo = {
    title: metaText("title"),
    author: byLocalName(opf, "creator")
      .map((c) => c.textContent?.trim())
      .filter(Boolean)
      .join(", ") || undefined,
    language: metaText("language"),
    description: metaText("description")?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  };

  // Manifiesto
  const manifest = new Map<string, ManifestItem>();
  const byPath = new Map<string, ManifestItem>();
  for (const item of byLocalName(opf, "item")) {
    const id = item.getAttribute("id") ?? "";
    const href = item.getAttribute("href") ?? "";
    const m: ManifestItem = {
      id,
      path: resolvePath(opfDir, href),
      type: item.getAttribute("media-type") ?? "",
      properties: item.getAttribute("properties") ?? "",
    };
    manifest.set(id, m);
    byPath.set(m.path.toLowerCase(), m);
  }

  // Spine (orden de lectura)
  const spineEl = byLocalName(opf, "spine")[0];
  const spine: ManifestItem[] = [];
  for (const ref of spineEl ? childrenByLocalName(spineEl, "itemref") : []) {
    const item = manifest.get(ref.getAttribute("idref") ?? "");
    if (item && getEntry(item.path) && /html|xml/.test(item.type || "html")) spine.push(item);
  }
  if (spine.length === 0) {
    for (const item of manifest.values()) if (/xhtml|html/.test(item.type)) spine.push(item);
  }
  if (spine.length === 0) throw new Error("El EPUB no tiene capítulos legibles.");
  const spineIndex = new Map(spine.map((s, i) => [s.path.toLowerCase(), i]));

  // Portada
  let coverItem: ManifestItem | undefined = [...manifest.values()].find((m) => m.properties.split(/\s+/).includes("cover-image"));
  if (!coverItem) {
    const coverMeta = byLocalName(opf, "meta").find((m) => m.getAttribute("name") === "cover");
    const ref = coverMeta?.getAttribute("content");
    if (ref) coverItem = manifest.get(ref) ?? byPath.get(resolvePath(opfDir, ref).toLowerCase());
  }
  if (!coverItem) {
    coverItem = [...manifest.values()].find((m) => m.type.startsWith("image/") && /cover|portada/i.test(m.id + m.path));
  }
  if (coverItem && coverItem.type.startsWith("image/")) {
    const bytes = getEntry(coverItem.path);
    if (bytes) info.cover = new Blob([bytes.slice()], { type: coverItem.type });
  }

  // Recursos (imágenes) como URLs blob, creadas a pedido.
  const blobUrls = new Map<string, string>();
  const resourceUrl = (path: string): string | null => {
    const key = path.toLowerCase();
    if (blobUrls.has(key)) return blobUrls.get(key)!;
    const bytes = getEntry(path);
    if (!bytes) return null;
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const type = byPath.get(key)?.type || IMAGE_TYPES[ext] || "application/octet-stream";
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type }));
    blobUrls.set(key, url);
    return url;
  };

  const resolveHref = (href: string, fromChapter: number) => {
    if (/^[a-z]+:/i.test(href)) return null;
    const hash = href.indexOf("#");
    const anchor = hash >= 0 ? decodeURIComponent(href.slice(hash + 1)) : undefined;
    const pathPart = hash >= 0 ? href.slice(0, hash) : href;
    if (!pathPart) return { chapter: fromChapter, anchor };
    const base = dirname(spine[fromChapter]?.path ?? opfDir);
    const target = resolvePath(base, pathPart).toLowerCase();
    const chapter = spineIndex.get(target);
    return chapter === undefined ? null : { chapter, anchor };
  };

  // Índice
  const toc = readToc(manifest, spineEl, getEntry, (href, baseDir) => {
    const hash = href.indexOf("#");
    const anchor = hash >= 0 ? decodeURIComponent(href.slice(hash + 1)) : undefined;
    const path = resolvePath(baseDir, hash >= 0 ? href.slice(0, hash) : href).toLowerCase();
    const chapter = spineIndex.get(path);
    return chapter === undefined ? null : { chapter, anchor };
  });

  const titles = spine.map((_, i) => toc.find((t) => t.chapter === i)?.title ?? "");
  let lastTitle = "";
  for (let i = 0; i < titles.length; i++) {
    if (titles[i]) lastTitle = titles[i];
    else titles[i] = lastTitle || (i === 0 ? "Inicio" : `Sección ${i + 1}`);
  }

  const htmlCache = new Map<number, string>();
  const textCache = new Map<number, string>();

  const getHtml = async (i: number): Promise<string> => {
    if (htmlCache.has(i)) return htmlCache.get(i)!;
    const item = spine[i];
    if (!item) return "";
    const raw = readText(item.path) ?? "";
    const doc = parseChapter(raw);
    preserveInlineFormatting(doc);
    const body = doc.body ?? doc.getElementsByTagName("body")[0] ?? doc.documentElement;
    const baseDir = dirname(item.path);
    const html = sanitizeHtml(serializeChildren(body), {
      resolveResource: (src) => resourceUrl(resolvePath(baseDir, src)),
    });
    htmlCache.set(i, html);
    return html;
  };

  const content: ReflowContent = {
    kind: "reflow",
    chapters: spine.map((s, i) => ({ title: titles[i], size: Math.max(1, getEntry(s.path)?.length ?? 1) })),
    toc: toc.length ? toc : spine.map((_, i) => ({ title: titles[i], chapter: i, level: 0 })),
    getHtml,
    async getText(i) {
      if (!textCache.has(i)) textCache.set(i, htmlToText(await getHtml(i)));
      return textCache.get(i)!;
    },
    resolveHref,
    dispose() {
      for (const url of blobUrls.values()) URL.revokeObjectURL(url);
      blobUrls.clear();
      htmlCache.clear();
    },
  };
  return { content, info };
}

function parseChapter(raw: string): Document {
  const xml = new DOMParser().parseFromString(raw, "application/xhtml+xml");
  if (!xml.getElementsByTagName("parsererror").length && xml.getElementsByTagName("body").length) return xml;
  return new DOMParser().parseFromString(raw, "text/html");
}

function serializeChildren(el: Element): string {
  // innerHTML de un documento XHTML se serializa como XML (válido para el parser HTML).
  return el.innerHTML;
}

function readToc(
  manifest: Map<string, ManifestItem>,
  spineEl: Element | undefined,
  getEntry: (p: string) => Uint8Array | undefined,
  resolve: (href: string, baseDir: string) => { chapter: number; anchor?: string } | null
): TocItem[] {
  const items: TocItem[] = [];

  // EPUB 3: nav.xhtml
  const navItem = [...manifest.values()].find((m) => m.properties.split(/\s+/).includes("nav"));
  if (navItem) {
    const bytes = getEntry(navItem.path);
    if (bytes) {
      const doc = parseChapter(strFromU8(bytes));
      const navs = Array.from(doc.getElementsByTagName("nav"));
      const nav =
        navs.find((n) => (n.getAttribute("epub:type") ?? n.getAttributeNS("http://www.idpf.org/2007/ops", "type") ?? "").includes("toc")) ??
        navs[0];
      const baseDir = dirname(navItem.path);
      const walk = (ol: Element, level: number) => {
        for (const li of childrenByLocalName(ol, "li")) {
          const a = childrenByLocalName(li, "a")[0] ?? childrenByLocalName(li, "span")[0];
          const href = a?.getAttribute("href");
          const title = (a?.textContent ?? "").replace(/\s+/g, " ").trim();
          if (href && title) {
            const target = resolve(href, baseDir);
            if (target) items.push({ title, chapter: target.chapter, anchor: target.anchor, level });
          }
          const sub = childrenByLocalName(li, "ol")[0];
          if (sub) walk(sub, level + 1);
        }
      };
      const ol = nav ? childrenByLocalName(nav, "ol")[0] ?? nav.getElementsByTagName("ol")[0] : undefined;
      if (ol) walk(ol, 0);
    }
  }
  if (items.length) return items;

  // EPUB 2: toc.ncx
  const ncxId = spineEl?.getAttribute("toc");
  const ncxItem = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((m) => m.type === "application/x-dtbncx+xml");
  if (ncxItem) {
    const bytes = getEntry(ncxItem.path);
    if (bytes) {
      const doc = parseXml(strFromU8(bytes));
      const baseDir = dirname(ncxItem.path);
      const navMap = byLocalName(doc, "navmap")[0];
      const walk = (parent: Element, level: number) => {
        for (const np of childrenByLocalName(parent, "navpoint")) {
          const label = byLocalName(np, "text")[0]?.textContent?.replace(/\s+/g, " ").trim() ?? "";
          const src = childrenByLocalName(np, "content")[0]?.getAttribute("src");
          if (src && label) {
            const target = resolve(src, baseDir);
            if (target) items.push({ title: label, chapter: target.chapter, anchor: target.anchor, level });
          }
          walk(np, level + 1);
        }
      };
      if (navMap) walk(navMap, 0);
    }
  }
  return items;
}
