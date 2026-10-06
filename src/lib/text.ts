// Utilidades de texto: palabras, oraciones, normalización y búsqueda.
// Todo es puro (sin DOM) para poder probarse fácilmente.

/** Palabras vacías del español (y algunas del inglés) para los juegos. */
export const STOPWORDS = new Set(
  (
    "a al algo algunas algunos ante antes aquel aquella aquellas aquellos aqui aquí as asi así aun aún " +
    "cada casi como con contra cual cuando de del desde donde dos e el él ella ellas ello ellos en entre " +
    "era eran es esa esas ese eso esos esta está estaba estaban estar este esto estos fue fueron ha había " +
    "han hasta hay la las le les lo los mas más me mi mí mis mucho muy nada ni no nos o os otra otro para " +
    "pero poco por porque que qué quien se sea ser si sí sin sino sobre su sus tal también tan tanto te " +
    "tenía tiene todo todos tu tú tus un una uno unos unas y ya yo the of and to in is it that was he she " +
    "for on with as his her at by"
  ).split(" ")
);

/** Separa en palabras conservando la puntuación pegada (para lectura rápida). */
export function tokenizeWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Cuenta palabras de un texto. */
export function countWords(text: string): number {
  let n = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const space = c === 32 || c === 10 || c === 13 || c === 9 || c === 160;
    if (space) inWord = false;
    else if (!inWord) {
      inWord = true;
      n++;
    }
  }
  return n;
}

/** Quita la puntuación de los extremos de una palabra. */
export function stripPunct(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** Minúsculas y sin tildes (para comparar). */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Versión de `fold` que conserva la longitud carácter a carácter, de modo que
 * los índices de una búsqueda sobre el texto plegado sirven en el original.
 */
export function foldSameLength(s: string): string {
  let out = "";
  for (const ch of s) {
    const base = ch.normalize("NFD")[0] ?? ch;
    const lower = base.toLowerCase();
    // Algunos caracteres cambian de longitud al pasar a minúsculas; se conservan.
    out += lower.length === ch.length ? lower : ch.length === 1 ? lower[0] : ch;
  }
  return out;
}

/** Divide un texto en oraciones (aproximado, pensado para el español). */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = clean.split(/(?<=[.!?…»"”])\s+(?=[¿¡«"“(\p{Lu}\p{N}—–-])/u);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Normaliza saltos de línea y espacios de un texto extraído. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface SearchHit {
  index: number;
  length: number;
  snippet: string;
  /** Posición de la coincidencia dentro de `snippet`. */
  matchStart: number;
}

/** Busca un término (sin distinguir mayúsculas ni tildes). */
export function searchText(text: string, query: string, max = 200): SearchHit[] {
  const q = foldSameLength(query.trim());
  if (q.length < 2) return [];
  const hay = foldSameLength(text);
  const hits: SearchHit[] = [];
  let from = 0;
  while (hits.length < max) {
    const i = hay.indexOf(q, from);
    if (i < 0) break;
    const start = Math.max(0, i - 40);
    const end = Math.min(text.length, i + q.length + 60);
    const lead = start > 0 ? "…" : "";
    hits.push({
      index: i,
      length: q.length,
      snippet: lead + text.slice(start, end).replace(/\s/g, " ") + (end < text.length ? "…" : ""),
      matchStart: lead.length + (i - start),
    });
    from = i + q.length;
  }
  return hits;
}

/** Palabras "de contenido" (no vacías, con letras y de cierto largo). */
export function contentWords(text: string, minLen = 4): string[] {
  const out: string[] = [];
  for (const raw of tokenizeWords(text)) {
    const w = stripPunct(raw);
    if (w.length < minLen) continue;
    if (!/\p{L}/u.test(w)) continue;
    if (STOPWORDS.has(w.toLowerCase())) continue;
    out.push(w);
  }
  return out;
}
