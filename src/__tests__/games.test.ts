import { CLASSICS, classicsText } from "../games/sources";
import { makeCloze, makeFlash, makeSchulte, makeScramble, makeWordPresence, scrambleCorrect, takePassage, usableSentences } from "../games/generators";
import { chunkDuration, chunkWords, delayFactor, orpIndex, splitAtOrp } from "../games/rsvp";
import { seededRandom } from "../lib/util";
import { fold } from "../lib/text";

const text = classicsText();

describe("generadores de minijuegos", () => {
  it("hay texto clásico suficiente", () => {
    expect(CLASSICS.length).toBeGreaterThan(3);
    expect(usableSentences(text).length).toBeGreaterThan(20);
  });

  it("palabra perdida: la respuesta está entre 4 opciones distintas", () => {
    const qs = makeCloze(text, seededRandom(1), 10);
    expect(qs.length).toBe(10);
    for (const q of qs) {
      expect(q.options).toHaveLength(4);
      expect(q.options).toContain(q.answer);
      expect(new Set(q.options.map(fold)).size).toBe(4);
      expect(`${q.before} ${q.answer} ${q.after}`.length).toBeGreaterThan(20);
    }
  });

  it("ordena la frase: el desorden es una permutación y se valida", () => {
    const qs = makeScramble(text, seededRandom(2), 6);
    expect(qs.length).toBe(6);
    for (const q of qs) {
      expect(q.shuffled.map((x) => x.id).sort((a, b) => a - b)).toEqual(q.words.map((_, i) => i));
      expect(scrambleCorrect(q, q.words.map((_, i) => i))).toBe(true);
      expect(scrambleCorrect(q, q.words.map((_, i) => i).reverse())).toBe(q.words.join() === [...q.words].reverse().join());
    }
  });

  it("destello: frases con opciones del mismo largo", () => {
    const qs = makeFlash(text, seededRandom(3), 10);
    expect(qs.length).toBe(10);
    for (const q of qs) {
      expect(q.options).toContain(q.phrase);
      const n = q.phrase.split(" ").length;
      expect(q.options.every((o) => o.split(" ").length === n)).toBe(true);
    }
  });

  it("test de velocidad: pasaje y preguntas de presencia", () => {
    const passage = takePassage(text, 120, seededRandom(4));
    expect(passage.split(/\s+/).length).toBeGreaterThanOrEqual(100);
    const qs = makeWordPresence(passage, text, seededRandom(5), 3);
    expect(qs).toHaveLength(3);
    for (const q of qs) {
      expect(fold(passage)).toContain(fold(q.answer));
      for (const o of q.options.filter((o) => o !== q.answer)) expect(fold(passage).includes(fold(o))).toBe(false);
    }
  });

  it("tabla de Schulte con todos los números", () => {
    const g = makeSchulte(5, seededRandom(6));
    expect([...g].sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });
});

describe("lectura rápida", () => {
  it("elige la letra de enfoque", () => {
    expect(orpIndex("a")).toBe(0);
    expect(orpIndex("casa")).toBe(1);
    expect(orpIndex("lectura")).toBe(2);
    expect(orpIndex("«biblioteca»")).toBe(4);
    expect(splitAtOrp("lectura")).toEqual(["le", "c", "tura"]);
  });

  it("pausa más en los puntos", () => {
    expect(delayFactor("fin.")).toBeGreaterThan(delayFactor("medio,"));
    expect(delayFactor("medio,")).toBeGreaterThan(delayFactor("palabra"));
    expect(chunkDuration("hola", 300)).toBeCloseTo(200);
  });

  it("agrupa palabras sin cruzar el final de oración", () => {
    expect(chunkWords(["Era", "de", "noche.", "Luego", "amaneció"], 2)).toEqual(["Era de", "noche.", "Luego amaneció"]);
  });
});
