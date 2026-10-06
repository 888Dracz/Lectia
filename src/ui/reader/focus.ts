// Herramientas de lectura enfocada y notas al pie. Solo envuelven texto en
// elementos (no agregan ni quitan caracteres), así los desplazamientos de
// subrayados y búsquedas siguen coincidiendo.
import { textNodes } from "./dom";

export interface FocusOptions {
  bionic: boolean;
  ratio: number;
  sentenceStart: boolean;
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

/** Cuántas letras de una palabra se resaltan en modo biónico. */
export function bionicLength(word: string, ratio: number): number {
  const n = [...word].length;
  if (n <= 1) return n;
  if (n <= 3) return 1;
  return Math.max(1, Math.min(n - 1, Math.round(n * ratio)));
}

/**
 * Divide un texto en trozos para el resaltado: `strong` marca el inicio de
 * las palabras (biónico) y `first` la primera palabra de cada oración.
 */
export function focusSegments(
  text: string,
  o: FocusOptions,
  sentenceOpen: boolean
): { segments: { text: string; kind: "plain" | "bionic" | "first" }[]; sentenceOpen: boolean } {
  const out: { text: string; kind: "plain" | "bionic" | "first" }[] = [];
  let pos = 0;
  let open = sentenceOpen;
  const push = (t: string, kind: "plain" | "bionic" | "first") => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind === "plain") last.text += t;
    else out.push({ text: t, kind });
  };
  for (const m of text.matchAll(WORD)) {
    const before = text.slice(pos, m.index);
    // Abre oración un signo de cierre (o ¡ ¿) antes de la palabra; comillas o rayas no la cierran.
    if (/[.!?…]["»”’)\]]*\s+$|[¡¿]\s*$/.test(before)) open = true;
    else if (before && !/^[\s"«“(—–-]*$/.test(before)) open = false;
    push(before, "plain");
    const w = m[0];
    if (o.sentenceStart && open) {
      push(w, "first");
    } else if (o.bionic) {
      const chars = [...w];
      const k = bionicLength(w, o.ratio);
      push(chars.slice(0, k).join(""), "bionic");
      push(chars.slice(k).join(""), "plain");
    } else push(w, "plain");
    open = false;
    pos = m.index! + w.length;
  }
  const tail = text.slice(pos);
  if (/[.!?…]["»”’)]*\s*$/.test(tail)) open = true;
  push(tail, "plain");
  return { segments: out, sentenceOpen: open };
}

const BLOCK = "p, li, blockquote, h1, h2, h3, h4, h5, h6, dd, dt, figcaption, td, th, div";

export function applyFocusMarks(root: HTMLElement, o: FocusOptions): void {
  if (!o.bionic && !o.sentenceStart) return;
  let open = true;
  let lastBlock: Element | null = null;
  for (const node of textNodes(root)) {
    if (!node.data.trim() || node.parentElement?.closest("pre, code, sup, .rd-fn-skip")) continue;
    const block = node.parentElement?.closest(BLOCK) ?? null;
    if (block !== lastBlock) {
      open = true;
      lastBlock = block;
    }
    const res = focusSegments(node.data, o, open);
    open = res.sentenceOpen;
    if (res.segments.length === 1 && res.segments[0].kind === "plain") continue;
    const frag = document.createDocumentFragment();
    for (const seg of res.segments) {
      if (seg.kind === "plain") frag.appendChild(document.createTextNode(seg.text));
      else {
        const b = document.createElement("b");
        b.className = seg.kind === "bionic" ? "rd-bionic" : "rd-first";
        b.textContent = seg.text;
        frag.appendChild(b);
      }
    }
    node.replaceWith(frag);
  }
}

/** ¿El enlace es una llamada a nota al pie? */
export function isNoteLink(a: HTMLAnchorElement): boolean {
  if (a.dataset.noteref) return true;
  const href = a.getAttribute("href") ?? "";
  if (!href.includes("#")) return false;
  const text = (a.textContent ?? "").trim();
  return /^[[(]?(\d{1,4}|[*†‡§]+|[ivxlc]{1,5}|[a-z])[\])]?$/i.test(text) || !!a.closest("sup") || !!a.querySelector("sup");
}

/** HTML de la nota con ese id (o del párrafo que la contiene). */
export function footnoteOf(root: Element, id: string): string | null {
  const el = Array.from(root.querySelectorAll("[id]")).find((e) => e.id === id);
  if (!el) return null;
  let note: Element = el;
  // Muchas notas son un <a id> vacío dentro del párrafo de la nota.
  if ((note.textContent ?? "").trim().length < 4 || /^(A|SPAN|SUP)$/.test(note.tagName)) {
    note = el.closest("[data-fn], aside, li, p, div, dd") ?? el;
  }
  const html = note.innerHTML.trim();
  if (!html || (note.textContent ?? "").length > 4000) return null;
  return html;
}
