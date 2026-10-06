// Lectura rápida RSVP (una palabra a la vez en el centro de la pantalla).
import { tokenizeWords } from "../lib/text";

/**
 * Punto óptimo de reconocimiento: la letra donde fijar la vista. Se resalta
 * para que el ojo no tenga que moverse.
 */
export function orpIndex(word: string): number {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, "").length;
  const lead = word.search(/[\p{L}\p{N}]/u);
  const offset = lead < 0 ? 0 : lead;
  let idx: number;
  if (letters <= 1) idx = 0;
  else if (letters <= 5) idx = 1;
  else if (letters <= 9) idx = 2;
  else if (letters <= 13) idx = 3;
  else idx = 4;
  return Math.min(word.length - 1, offset + idx);
}

/** Multiplicador de pausa según la puntuación y el largo de la palabra. */
export function delayFactor(chunk: string): number {
  let f = 1;
  if (/[.!?…]["»”)]?$/.test(chunk)) f = 2.2;
  else if (/[;:]["»”)]?$/.test(chunk)) f = 1.7;
  else if (/[,—–]["»”)]?$/.test(chunk)) f = 1.4;
  const len = chunk.replace(/\s+/g, "").length;
  if (len > 12) f += 0.3;
  if (len > 18) f += 0.3;
  return f;
}

export function chunkWords(words: string[], size: number): string[] {
  if (size <= 1) return words;
  const out: string[] = [];
  let cur: string[] = [];
  for (const w of words) {
    cur.push(w);
    // Corta antes si termina una oración para no mezclar ideas.
    if (cur.length >= size || /[.!?…;:]["»”)]?$/.test(w)) {
      out.push(cur.join(" "));
      cur = [];
    }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

export function msPerWord(wpm: number): number {
  return 60000 / Math.max(50, wpm);
}

/** Tiempo de pantalla de un fragmento (en ms). */
export function chunkDuration(chunk: string, wpm: number): number {
  const n = Math.max(1, tokenizeWords(chunk).length);
  return msPerWord(wpm) * n * delayFactor(chunk);
}

/** Separa una palabra en [antes, letra foco, después]. */
export function splitAtOrp(word: string): [string, string, string] {
  const i = orpIndex(word);
  return [word.slice(0, i), word.charAt(i), word.slice(i + 1)];
}
