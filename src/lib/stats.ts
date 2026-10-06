// Cálculos de telemetría de lectura de un libro (velocidad y tiempo restante).
import type { BookMeta } from "../books/types";

export const DEFAULT_WPM = 230;

export interface HistoryRow {
  day: string;
  ms: number;
  /** Avance de ese día (0–1). */
  delta: number;
  wpm: number | null;
}

/** Filas del historial por día, de la más reciente a la más antigua. */
export function historyRows(book: BookMeta): HistoryRow[] {
  const words = book.wordCount ?? 0;
  return Object.entries(book.history ?? {})
    .map(([day, h]) => {
      const delta = Math.max(0, h.to - h.from);
      const min = h.ms / 60000;
      const wpm = words && min >= 1 && delta > 0 ? Math.round((delta * words) / min) : null;
      return { day, ms: h.ms, delta, wpm };
    })
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

/** Velocidad de lectura (palabras por minuto) a partir del historial del libro. */
export function readingWpm(book: BookMeta): { wpm: number; measured: boolean } {
  const words = book.wordCount ?? 0;
  let ms = 0;
  let delta = 0;
  for (const h of Object.values(book.history ?? {})) {
    const d = h.to - h.from;
    // Saltos grandes en poco tiempo (hojear, ir al final) no cuentan.
    if (d <= 0 || h.ms < 60000 || (d * words) / (h.ms / 60000) > 1500) continue;
    ms += h.ms;
    delta += d;
  }
  if (!words || ms < 3 * 60000 || delta <= 0) return { wpm: DEFAULT_WPM, measured: false };
  return { wpm: Math.min(1200, Math.max(60, Math.round((delta * words) / (ms / 60000)))), measured: true };
}

/** Minutos que faltan para leer `words` palabras a `wpm`. */
export function minutesFor(words: number, wpm: number): number {
  return wpm > 0 ? words / wpm : 0;
}

/** Palabras que faltan para terminar el capítulo y el libro. */
export function remainingWords(
  totalWords: number,
  sizes: number[],
  chapter: number,
  chapterFraction: number,
  bookPercent: number
): { chapter: number; book: number } {
  const total = sizes.reduce((a, b) => a + Math.max(1, b), 0) || 1;
  const chWords = (totalWords * Math.max(1, sizes[chapter] ?? 1)) / total;
  return {
    chapter: Math.max(0, chWords * (1 - Math.min(1, Math.max(0, chapterFraction)))),
    book: Math.max(0, totalWords * (1 - Math.min(1, Math.max(0, bookPercent)))),
  };
}

export function formatMinutes(min: number): string {
  if (!isFinite(min) || min <= 0) return "0 min";
  if (min < 1) return "<1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}
