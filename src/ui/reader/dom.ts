// Utilidades de DOM del lector: desplazamientos de texto, subrayados y bloques.

export function textNodes(root: Node): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

/** Desplazamiento (en caracteres del texto plano) de un punto del DOM. */
export function offsetOf(root: Node, node: Node, offset: number): number {
  const r = document.createRange();
  r.setStart(root, 0);
  try {
    r.setEnd(node, offset);
  } catch {
    return 0;
  }
  return r.toString().length;
}

/** Punto del DOM (nodo de texto + desplazamiento) para un desplazamiento global. */
export function pointAt(root: Node, offset: number): { node: Text; offset: number } | null {
  let pos = 0;
  let last: Text | null = null;
  for (const n of textNodes(root)) {
    const len = n.data.length;
    if (offset <= pos + len && len > 0) return { node: n, offset: Math.max(0, offset - pos) };
    pos += len;
    last = n;
  }
  return last ? { node: last, offset: last.data.length } : null;
}

export function rangeFromOffsets(root: Node, start: number, end: number): Range | null {
  const a = pointAt(root, start);
  const b = pointAt(root, end);
  if (!a || !b) return null;
  const r = document.createRange();
  r.setStart(a.node, a.offset);
  r.setEnd(b.node, b.offset);
  return r;
}

/** Envuelve el rango [start, end) en elementos creados por `make`. */
export function wrapOffsets(root: Node, start: number, end: number, make: () => HTMLElement): HTMLElement[] {
  const targets: [Text, number, number][] = [];
  let pos = 0;
  for (const n of textNodes(root)) {
    const len = n.data.length;
    const s = Math.max(start, pos);
    const e = Math.min(end, pos + len);
    if (s < e && n.data.slice(s - pos, e - pos).trim()) targets.push([n, s - pos, e - pos]);
    pos += len;
    if (pos >= end) break;
  }
  const marks: HTMLElement[] = [];
  for (const [node, s, e] of targets) {
    let t = node;
    if (s > 0) t = t.splitText(s);
    if (e - s < t.data.length) t.splitText(e - s);
    const mark = make();
    t.parentNode?.insertBefore(mark, t);
    mark.appendChild(t);
    marks.push(mark);
  }
  return marks;
}

export function unwrapMarks(root: Element, selector: string) {
  root.querySelectorAll(selector).forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parent.normalize();
  });
}

const BLOCK_SEL = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, dt, dd, figcaption, td, th";

/** Bloques de texto "hoja" (párrafos, títulos…) en orden de lectura. */
export function readingBlocks(root: Element): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SEL)).filter(
    (el) => !el.querySelector(BLOCK_SEL) && (el.textContent ?? "").trim().length > 0
  );
  if (all.length) return all;
  // Sin párrafos: se usan los div con texto propio.
  return Array.from(root.querySelectorAll<HTMLElement>("div, section")).filter((el) =>
    Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.nodeValue ?? "").trim())
  );
}
