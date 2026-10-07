// Poner y quitar marcas sobre un tramo de texto, como en un procesador de textos:
// si el tramo ya tiene una forma (negrita, subrayado…), tocarla otra vez la quita.
import { uid } from "../lib/util";
import type { Highlight, HighlightColor, MarkStyle } from "../store/state";

export interface TextSpan {
  bookId: string;
  chapter: number;
  /** Desplazamientos en el texto plano del capítulo, [start, end). */
  start: number;
  end: number;
}

/**
 * Cambio en la lista de marcas: se quitan las de `out` (por id) y se agregan las de `into`.
 * Deshacer es aplicar el cambio al revés.
 */
export interface MarkEdit {
  out: Highlight[];
  into: Highlight[];
}

export const EMPTY_EDIT: MarkEdit = { out: [], into: [] };

export function isEmptyEdit(e: MarkEdit): boolean {
  return !e.out.length && !e.into.length;
}

export function applyMarkEdit(list: Highlight[], e: MarkEdit): Highlight[] {
  if (isEmptyEdit(e)) return list;
  const gone = new Set(e.out.map((h) => h.id));
  return [...list.filter((h) => !gone.has(h.id)), ...e.into];
}

export function invertMarkEdit(e: MarkEdit): MarkEdit {
  return { out: e.into, into: e.out };
}

/** Marcas vigentes que tocan el tramo (opcionalmente solo de una forma). */
export function marksIn(list: Highlight[], span: TextSpan, style?: MarkStyle): Highlight[] {
  return list.filter(
    (h) =>
      !h.discardedAt &&
      h.bookId === span.bookId &&
      h.chapter === span.chapter &&
      h.start < span.end &&
      h.end > span.start &&
      (!style || (h.style ?? "highlight") === style)
  );
}

/** ¿Todas las letras del tramo están cubiertas por estas marcas? (los espacios no cuentan) */
export function covers(marks: Highlight[], span: TextSpan, source: string): boolean {
  if (!marks.length) return false;
  let any = false;
  for (let i = span.start; i < span.end; i++) {
    if (!/\S/.test(source[i] ?? "")) continue;
    any = true;
    if (!marks.some((h) => h.start <= i && h.end > i)) return false;
  }
  return any;
}

/** Formas que cubren por completo el tramo (para mostrarlas "puestas" en el menú). */
export function stylesOn(list: Highlight[], span: TextSpan, source: string): Set<MarkStyle> {
  const here = marksIn(list, span);
  const on = new Set<MarkStyle>();
  for (const s of new Set(here.map((h) => h.style ?? "highlight"))) {
    if (covers(here.filter((h) => (h.style ?? "highlight") === s), span, source)) on.add(s);
  }
  return on;
}

/** Recorta [start, end) quitando espacios de los bordes; null si no queda texto. */
function trimmed(source: string, start: number, end: number): { start: number; end: number; text: string } | null {
  const raw = source.slice(start, end);
  const lead = raw.length - raw.trimStart().length;
  const text = raw.trim();
  if (!text) return null;
  return { start: start + lead, end: start + lead + text.length, text };
}

/**
 * Quita las marcas del tramo (o solo las de una forma). Las que lo cruzan a medias
 * se recortan; si el tramo queda en medio, se parten en dos. La primera parte
 * conserva el id y la nota de la marca original.
 */
export function unmarkSpan(list: Highlight[], span: TextSpan, source: string, style?: MarkStyle): MarkEdit {
  const out: Highlight[] = [];
  const into: Highlight[] = [];
  for (const h of marksIn(list, span, style)) {
    out.push(h);
    const pieces = [
      h.start < span.start ? trimmed(source, h.start, span.start) : null,
      h.end > span.end ? trimmed(source, span.end, h.end) : null,
    ].filter((p): p is NonNullable<typeof p> => !!p);
    pieces.forEach((p, i) => {
      into.push(i === 0 ? { ...h, ...p } : { ...h, ...p, id: uid("hl"), note: "" });
    });
  }
  return { out, into };
}

/**
 * Pone una forma en el tramo. Si ya había marcas de esa misma forma que lo tocan,
 * se funden en una sola (con sus notas juntas) para no apilar marcas repetidas.
 */
export function markSpan(
  list: Highlight[],
  span: TextSpan,
  source: string,
  style: MarkStyle,
  color: HighlightColor,
  percent?: number
): { edit: MarkEdit; mark: Highlight | null } {
  const same = marksIn(list, span, style).sort((a, b) => a.start - b.start);
  const start = Math.min(span.start, ...same.map((h) => h.start));
  const end = Math.max(span.end, ...same.map((h) => h.end));
  const t = trimmed(source, start, end);
  if (!t) return { edit: EMPTY_EDIT, mark: null };
  const base = same[0];
  const mark: Highlight = {
    id: base?.id ?? uid("hl"),
    bookId: span.bookId,
    chapter: span.chapter,
    ...t,
    color,
    style,
    note: same
      .map((h) => h.note.trim())
      .filter(Boolean)
      .join("\n\n"),
    percent: base?.percent ?? percent,
    createdAt: base?.createdAt ?? Date.now(),
  };
  return { edit: { out: same, into: [mark] }, mark };
}

/** Cambia el color de las marcas de una forma que tocan el tramo. */
export function recolorSpan(list: Highlight[], span: TextSpan, style: MarkStyle, color: HighlightColor): MarkEdit {
  const out = marksIn(list, span, style).filter((h) => h.color !== color);
  return { out, into: out.map((h) => ({ ...h, color })) };
}
