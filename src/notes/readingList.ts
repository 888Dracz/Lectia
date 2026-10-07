// Lógica pura de la lista por leer: orden, coincidencias y estimaciones.
import type { BookMeta } from "../books/types";
import { fold } from "../lib/text";
import { clamp } from "../lib/util";
import type { ReadingListItem } from "../store/state";

/** Palabras por minuto que se asumen si no hay un test de velocidad. */
export const DEFAULT_WPM = 230;

export const isActiveItem = (i: ReadingListItem) => !i.doneAt && !i.discardedAt;

/**
 * Mueve un elemento pendiente a la posición `to` (contando solo los
 * pendientes). Los leídos y descartados quedan al final, en su orden.
 */
export function moveActive(list: ReadingListItem[], id: string, to: number): ReadingListItem[] {
  const active = list.filter(isActiveItem);
  const from = active.findIndex((i) => i.id === id);
  if (from < 0) return list;
  const target = clamp(Math.round(to), 0, active.length - 1);
  if (target === from) return list;
  const next = active.slice();
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return [...next, ...list.filter((i) => !isActiveItem(i))];
}

/** Título normalizado para comparar ("El Túnel" ≈ "el tunel"). */
export function normalizeTitle(s: string): string {
  return fold(s)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Busca un deseo (sin archivo) que corresponda a un libro recién agregado. */
export function findWishFor(list: ReadingListItem[], title: string): ReadingListItem | undefined {
  const t = normalizeTitle(title);
  if (t.length < 3) return undefined;
  return list.find((i) => {
    if (i.bookId || !isActiveItem(i)) return false;
    const w = normalizeTitle(i.title);
    return w === t || (w.length >= 6 && (t.startsWith(w) || w.startsWith(t)));
  });
}

/** Velocidad de lectura de la persona (mediana de sus últimos tests). */
export function readingWpm(history: { wpm: number }[]): number {
  const recent = history.slice(-5).map((h) => h.wpm).filter((w) => w > 60 && w < 1500);
  if (!recent.length) return DEFAULT_WPM;
  const sorted = recent.sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Minutos que faltan para leer un libro (null si no se sabe cuántas palabras tiene). */
export function minutesLeft(book: BookMeta | undefined, wpm: number): number | null {
  if (!book?.wordCount) return null;
  const left = 1 - (book.location?.percent ?? 0);
  return Math.max(1, Math.round((book.wordCount * left) / Math.max(60, wpm)));
}

export interface ListEstimate {
  minutes: number;
  /** Libros de los que se sabe la extensión. */
  known: number;
  unknown: number;
  /** Días al ritmo de la meta diaria. */
  days: number;
}

export function estimateList(items: ReadingListItem[], books: Record<string, BookMeta>, wpm: number, dailyGoalMin: number): ListEstimate {
  let minutes = 0;
  let known = 0;
  let unknown = 0;
  for (const i of items) {
    const m = minutesLeft(i.bookId ? books[i.bookId] : undefined, wpm);
    if (m === null) unknown++;
    else {
      known++;
      minutes += m;
    }
  }
  return { minutes, known, unknown, days: minutes ? Math.ceil(minutes / Math.max(5, dailyGoalMin)) : 0 };
}

/** "3 semanas", "5 días", "2 meses"… */
export function formatSpan(days: number): string {
  if (days <= 1) return "1 día";
  if (days < 14) return `${days} días`;
  if (days < 60) return `${Math.round(days / 7)} semanas`;
  if (days < 365) return `${Math.round(days / 30)} meses`;
  const years = Math.round(days / 365);
  return years <= 1 ? "1 año" : `${years} años`;
}
