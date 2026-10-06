// Limpieza y manipulación del HTML de los libros. Todo el contenido que se
// muestra en el lector pasa por DOMPurify: los EPUB y HTML pueden traer
// scripts o estilos que no deben ejecutarse ni romper los temas de lectura.
import DOMPurify from "dompurify";
import { escapeHtml } from "../lib/util";

const FORBID_TAGS = [
  "script", "style", "link", "meta", "iframe", "frame", "frameset", "object", "embed",
  "form", "input", "button", "select", "textarea", "audio", "video", "source", "track",
  "base", "title", "head", "noscript", "canvas", "dialog", "template",
];

const FORBID_ATTR = ["style", "class", "align", "bgcolor", "color", "face", "background", "border", "dir", "xmlns"];

const BLOCK_TAGS = new Set([
  "P", "DIV", "SECTION", "ARTICLE", "ASIDE", "HEADER", "FOOTER", "MAIN", "NAV", "BLOCKQUOTE",
  "H1", "H2", "H3", "H4", "H5", "H6", "LI", "UL", "OL", "DL", "DT", "DD", "PRE", "TABLE", "TR",
  "FIGURE", "FIGCAPTION", "HR", "BR",
]);

let purifierReady = false;

function purifier() {
  if (!purifierReady) {
    purifierReady = true;
    // Los enlaces externos se abren fuera de la app y sin acceso a ella.
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        const href = node.getAttribute("href") ?? "";
        if (/^https?:/i.test(href)) node.setAttribute("rel", "noopener noreferrer");
      }
    });
  }
  return DOMPurify;
}

/**
 * Traduce algunos estilos en línea útiles (centrado, cursiva, negrita) a
 * atributos `data-*` que entiende la hoja de estilos del lector, antes de que
 * DOMPurify elimine los estilos originales.
 */
export function preserveInlineFormatting(root: Element | Document): void {
  const els = root.querySelectorAll("[style]");
  els.forEach((el) => {
    const st = (el.getAttribute("style") ?? "").toLowerCase();
    if (/text-align\s*:\s*center/.test(st)) el.setAttribute("data-a", "c");
    else if (/text-align\s*:\s*right/.test(st)) el.setAttribute("data-a", "r");
    if (/font-style\s*:\s*italic/.test(st)) el.setAttribute("data-i", "1");
    if (/font-weight\s*:\s*(bold|[6-9]00)/.test(st)) el.setAttribute("data-b", "1");
  });
  root.querySelectorAll("center").forEach((el) => el.setAttribute("data-a", "c"));
  root.querySelectorAll("[align]").forEach((el) => {
    const a = (el.getAttribute("align") ?? "").toLowerCase();
    if (a === "center") el.setAttribute("data-a", "c");
    else if (a === "right") el.setAttribute("data-a", "r");
  });
}

export interface SanitizeOptions {
  /** Devuelve la URL final (p. ej. blob:) de un recurso relativo, o null. */
  resolveResource?: (src: string) => string | null;
}

/** Limpia HTML y devuelve un fragmento listo para insertar en el lector. */
export function sanitizeToFragment(html: string, opts: SanitizeOptions = {}): DocumentFragment {
  const frag = purifier().sanitize(html, {
    FORBID_TAGS,
    FORBID_ATTR,
    RETURN_DOM_FRAGMENT: true,
    ALLOW_DATA_ATTR: true,
  }) as DocumentFragment;

  // Portadas EPUB típicas: <svg><image xlink:href="cover.jpg"/></svg> → <img>.
  frag.querySelectorAll("svg").forEach((svg) => {
    const images = svg.querySelectorAll("image");
    if (images.length === 1 && !(svg.textContent ?? "").trim()) {
      const im = images[0];
      const href = im.getAttribute("href") ?? im.getAttribute("xlink:href") ?? im.getAttributeNS("http://www.w3.org/1999/xlink", "href");
      if (href) {
        const img = svg.ownerDocument.createElement("img");
        img.setAttribute("src", href);
        img.setAttribute("alt", "");
        svg.replaceWith(img);
      }
    }
  });

  frag.querySelectorAll("img").forEach((img) => {
    img.removeAttribute("width");
    img.removeAttribute("height");
    img.removeAttribute("srcset");
    img.setAttribute("loading", "eager");
    img.setAttribute("decoding", "async");
    const src = img.getAttribute("src") ?? "";
    if (opts.resolveResource && src && !/^(data|blob|https?):/i.test(src)) {
      const url = opts.resolveResource(src);
      if (url) img.setAttribute("src", url);
      else img.remove();
    } else if (/^https?:/i.test(src)) {
      // Sin peticiones externas desde los libros (privacidad y modo sin conexión).
      img.remove();
    }
  });

  frag.querySelectorAll("image").forEach((im) => {
    const href = im.getAttribute("href") ?? im.getAttribute("xlink:href");
    if (href && opts.resolveResource && !/^(data|blob):/i.test(href)) {
      const url = opts.resolveResource(href);
      if (url) {
        im.setAttribute("href", url);
        im.removeAttribute("xlink:href");
      }
    }
  });

  // Quita contenedores vacíos que solo ocupan espacio (muy común en EPUB).
  frag.querySelectorAll("div, span, p").forEach((el) => {
    if (!el.firstChild && !el.id) el.remove();
  });

  return frag;
}

export function sanitizeHtml(html: string, opts: SanitizeOptions = {}): string {
  const frag = sanitizeToFragment(html, opts);
  const div = document.createElement("div");
  div.appendChild(frag);
  return div.innerHTML;
}

/** Obtiene el texto de un nodo respetando los saltos de bloque. */
export function nodeToText(root: Node): string {
  let out = "";
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      out += n.nodeValue ?? "";
      return;
    }
    if (n.nodeType !== 1 && n.nodeType !== 11) return;
    const el = n as Element;
    const block = n.nodeType === 1 && BLOCK_TAGS.has(el.tagName.toUpperCase());
    if (block) out += "\n";
    for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
    if (block) out += "\n";
  };
  walk(root);
  return out
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return nodeToText(doc.body);
}

/**
 * Texto "plano" de un HTML concatenando los nodos de texto tal cual, sin
 * agregar saltos. Sus índices coinciden con los desplazamientos que usa el
 * lector para subrayados y búsquedas.
 */
export function htmlToFlatText(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return flatText(doc.body);
}

export function flatText(root: Node): string {
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let out = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out += n.nodeValue ?? "";
  return out;
}

/** Convierte texto plano en párrafos HTML. */
export function paragraphsToHtml(paragraphs: string[], headingTest?: (p: string) => boolean): string {
  return paragraphs
    .map((p) => (headingTest?.(p) ? `<h2>${escapeHtml(p)}</h2>` : `<p>${escapeHtml(p)}</p>`))
    .join("\n");
}

export interface HtmlChapter {
  title: string;
  html: string;
}

const MAX_CHAPTER_CHARS = 60000;

/**
 * Divide un documento HTML largo (Word, Markdown, HTML) en capítulos usando
 * los encabezados de nivel más alto; si no hay, lo corta por tamaño.
 */
export function splitHtmlIntoChapters(html: string, fallbackTitle: string): HtmlChapter[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  let root: Element = doc.body;
  // Desciende por envoltorios únicos (<div><section>…) para hallar los encabezados.
  while (root.children.length === 1 && /^(DIV|SECTION|ARTICLE|MAIN)$/.test(root.children[0].tagName)) {
    const only = root.children[0];
    const strayText = Array.from(root.childNodes).some((n) => n.nodeType === 3 && (n.nodeValue ?? "").trim());
    if (strayText) break;
    root = only;
  }

  const children = Array.from(root.childNodes);
  let splitTag: string | null = null;
  // El nivel de encabezado más alto que se repite marca los capítulos.
  for (const tag of ["H1", "H2", "H3"]) {
    const count = children.filter((n) => n.nodeType === 1 && (n as Element).tagName === tag).length;
    if (count >= 2) {
      splitTag = tag;
      break;
    }
  }

  const chapters: { title: string; nodes: Node[]; chars: number }[] = [];
  let current = { title: "", nodes: [] as Node[], chars: 0 };
  const push = () => {
    const hasContent = current.nodes.some(
      (n) => (n.textContent ?? "").trim() || (n.nodeType === 1 && (n as Element).querySelector?.("img, svg"))
    );
    if (hasContent) chapters.push(current);
  };

  for (const node of children) {
    const isHeading = splitTag && node.nodeType === 1 && (node as Element).tagName === splitTag;
    const len = (node.textContent ?? "").length;
    if (isHeading) {
      push();
      current = { title: (node.textContent ?? "").trim().slice(0, 90), nodes: [node], chars: len };
      continue;
    }
    if (current.chars + len > MAX_CHAPTER_CHARS && current.nodes.length > 0) {
      push();
      current = { title: current.title ? `${current.title} (cont.)` : "", nodes: [], chars: 0 };
    }
    current.nodes.push(node);
    current.chars += len;
  }
  push();

  if (chapters.length === 0) return [{ title: fallbackTitle, html }];

  let part = 0;
  return chapters.map((c, i) => {
    const div = doc.createElement("div");
    c.nodes.forEach((n) => div.appendChild(n));
    let title = c.title;
    if (!title) title = i === 0 && splitTag ? "Inicio" : `Parte ${++part}`;
    return { title, html: div.innerHTML };
  });
}

/** Contenido "fluido" a partir de capítulos HTML ya limpios. */
export function chaptersToToc(chapters: HtmlChapter[]) {
  return chapters.map((c, i) => ({ title: c.title, chapter: i, level: 0 }));
}
