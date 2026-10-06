// Generadores de preguntas para los minijuegos a partir de cualquier texto.
// Son puros (reciben un generador aleatorio) para poder probarse.
import { contentWords, fold, splitSentences, stripPunct, tokenizeWords } from "../lib/text";
import { pick, shuffle } from "../lib/util";

export interface ClozeQuestion {
  before: string;
  after: string;
  answer: string;
  options: string[];
}

export interface ScrambleQuestion {
  sentence: string;
  words: string[];
  shuffled: { id: number; word: string }[];
}

export interface FlashQuestion {
  phrase: string;
  options: string[];
}

export interface WordQuestion {
  options: string[];
  answer: string;
}

/** Oraciones aptas para juegos (ni muy cortas ni muy largas). */
export function usableSentences(text: string, minWords = 6, maxWords = 26): string[] {
  return splitSentences(text).filter((s) => {
    const n = tokenizeWords(s).length;
    return n >= minWords && n <= maxWords && /\p{L}/u.test(s);
  });
}

function distractors(pool: string[], answer: string, count: number, rnd: () => number): string[] {
  const a = fold(answer);
  const seen = new Set([a]);
  const candidates = shuffle(pool, rnd).filter((w) => {
    const f = fold(w);
    if (seen.has(f)) return false;
    seen.add(f);
    return true;
  });
  // Preferir palabras con la misma mayúscula inicial y largo parecido, para que no sea obvio.
  const upper = (w: string) => w.charAt(0) !== w.charAt(0).toLowerCase();
  const score = (w: string) => (upper(w) === upper(answer) ? 0 : 100) + Math.abs(w.length - answer.length);
  candidates.sort((x, y) => score(x) - score(y));
  return candidates.slice(0, count);
}

export function makeCloze(text: string, rnd: () => number = Math.random, count = 10): ClozeQuestion[] {
  const sentences = shuffle(usableSentences(text, 7, 30), rnd);
  const pool = contentWords(text, 4);
  const out: ClozeQuestion[] = [];
  for (const s of sentences) {
    if (out.length >= count) break;
    const tokens = tokenizeWords(s);
    const candidates = tokens
      .map((t, i) => ({ t, i, w: stripPunct(t) }))
      .filter((x) => x.w.length >= 5 && contentWords(x.w, 5).length === 1 && x.i > 0);
    if (!candidates.length) continue;
    const target = pick(candidates, rnd);
    const opts = distractors(pool, target.w, 3, rnd);
    if (opts.length < 3) continue;
    const lead = target.t.slice(0, target.t.indexOf(target.w));
    const trail = target.t.slice(target.t.indexOf(target.w) + target.w.length);
    out.push({
      before: [...tokens.slice(0, target.i), lead].join(" ").trimEnd(),
      after: (trail + " " + tokens.slice(target.i + 1).join(" ")).trim(),
      answer: target.w,
      options: shuffle([target.w, ...opts], rnd),
    });
  }
  return out;
}

/** Oraciones cortas o, si no hay, fragmentos entre comas de oraciones largas. */
function shortSentences(text: string, min: number, max: number): string[] {
  const out = usableSentences(text, min, max);
  for (const s of usableSentences(text, max + 1, 80)) {
    for (const clause of s.split(/[,;:—]\s+/)) {
      const clean = clause.replace(/[.;:,!?…»"”)]+$/, "").trim();
      const n = tokenizeWords(clean).length;
      if (n >= min && n <= max && /^[¿¡«"“(]?\p{L}/u.test(clean)) out.push(clean);
    }
  }
  return out;
}

export function makeScramble(text: string, rnd: () => number = Math.random, count = 8): ScrambleQuestion[] {
  const sentences = shuffle(shortSentences(text, 5, 10), rnd);
  const out: ScrambleQuestion[] = [];
  for (const s of sentences) {
    if (out.length >= count) break;
    const words = tokenizeWords(s);
    const indexed = words.map((word, id) => ({ id, word }));
    let shuffled = shuffle(indexed, rnd);
    for (let k = 0; k < 5 && shuffled.every((x, i) => x.id === i); k++) shuffled = shuffle(indexed, rnd);
    out.push({ sentence: s, words, shuffled });
  }
  return out;
}

/** Comprueba una respuesta del juego de ordenar (acepta palabras repetidas en otro orden). */
export function scrambleCorrect(q: ScrambleQuestion, answerIds: number[]): boolean {
  if (answerIds.length !== q.words.length) return false;
  return answerIds.every((id, i) => fold(q.words[id]) === fold(q.words[i]));
}

/** Frases cortas (2–4 palabras) para el juego de destello. */
export function makeFlash(text: string, rnd: () => number = Math.random, count = 12, minWords = 2, maxWords = 4): FlashQuestion[] {
  const words = tokenizeWords(text.replace(/[«»"“”()—]/g, " ")).map(stripPunct).filter((w) => w.length > 0);
  const phrases: string[] = [];
  for (let tries = 0; tries < 400 && phrases.length < count * 4; tries++) {
    const n = minWords + Math.floor(rnd() * (maxWords - minWords + 1));
    const start = Math.floor(rnd() * Math.max(1, words.length - n));
    const ph = words.slice(start, start + n);
    if (ph.length === n && ph.join("").length >= 6) phrases.push(ph.join(" "));
  }
  const uniq = [...new Set(phrases)];
  const out: FlashQuestion[] = [];
  for (const phrase of uniq) {
    if (out.length >= count) break;
    const others = distractors(uniq.filter((p) => p !== phrase && p.split(" ").length === phrase.split(" ").length), phrase, 3, rnd);
    if (others.length < 3) continue;
    out.push({ phrase, options: shuffle([phrase, ...others], rnd) });
  }
  return out;
}

/** Pregunta "¿cuál de estas palabras apareció en el texto?". */
export function makeWordPresence(passage: string, otherText: string, rnd: () => number = Math.random, count = 3): WordQuestion[] {
  const inPassage = [...new Set(contentWords(passage, 5))];
  const passageSet = new Set(inPassage.map(fold));
  const outside = [...new Set(contentWords(otherText, 5))].filter((w) => !passageSet.has(fold(w)));
  const out: WordQuestion[] = [];
  const answers = shuffle(inPassage, rnd);
  for (const answer of answers) {
    if (out.length >= count) break;
    const opts = distractors(outside, answer, 3, rnd);
    if (opts.length < 3) continue;
    out.push({ answer, options: shuffle([answer, ...opts], rnd) });
  }
  return out;
}

/** Toma un pasaje de ~N palabras que empiece al inicio de una oración. */
export function takePassage(text: string, targetWords: number, rnd: () => number = Math.random): string {
  const sentences = splitSentences(text);
  if (!sentences.length) return "";
  const totalWords = sentences.reduce((a, s) => a + tokenizeWords(s).length, 0);
  let start = 0;
  if (totalWords > targetWords * 1.5) {
    // Elegir un comienzo que deje suficiente texto por delante.
    let acc = 0;
    const limit = totalWords - targetWords;
    const candidates: number[] = [];
    sentences.forEach((s, i) => {
      if (acc <= limit) candidates.push(i);
      acc += tokenizeWords(s).length;
    });
    start = pick(candidates, rnd);
  }
  const out: string[] = [];
  let n = 0;
  for (let i = start; i < sentences.length && n < targetWords; i++) {
    out.push(sentences[i]);
    n += tokenizeWords(sentences[i]).length;
  }
  return out.join(" ");
}

/** Tabla de Schulte: números 1…n² desordenados. */
export function makeSchulte(size: number, rnd: () => number = Math.random): number[] {
  return shuffle(Array.from({ length: size * size }, (_, i) => i + 1), rnd);
}
