import { countWords, fold, foldSameLength, searchText, splitSentences, stripPunct, contentWords } from "../lib/text";

describe("texto", () => {
  it("cuenta palabras con espacios variados", () => {
    expect(countWords("  Hola,   mundo\nlector\t feliz ")).toBe(4);
    expect(countWords("")).toBe(0);
  });

  it("divide oraciones en español", () => {
    const s = splitSentences("Era de noche. ¿Quién llamaba? ¡Nadie! «Silencio», dijo él. Fin…");
    expect(s).toEqual(["Era de noche.", "¿Quién llamaba?", "¡Nadie!", "«Silencio», dijo él.", "Fin…"]);
  });

  it("quita puntuación de los extremos", () => {
    expect(stripPunct("«¡hola!»,")).toBe("hola");
    expect(stripPunct("—dijo")).toBe("dijo");
  });

  it("pliega mayúsculas y tildes sin cambiar la longitud", () => {
    const s = "Canción ÁRBOL ñandú";
    expect(foldSameLength(s)).toHaveLength(s.length);
    expect(foldSameLength(s)).toBe("cancion arbol nandu");
    expect(fold("Él está")).toBe("el esta");
  });

  it("busca sin distinguir tildes y marca la coincidencia", () => {
    const text = "La canción del pirata. Otra CANCION más.";
    const hits = searchText(text, "cancion");
    expect(hits).toHaveLength(2);
    expect(text.slice(hits[0].index, hits[0].index + hits[0].length)).toBe("canción");
    const h = hits[1];
    expect(h.snippet.slice(h.matchStart, h.matchStart + h.length)).toBe("CANCION");
  });

  it("filtra palabras vacías", () => {
    expect(contentWords("el perro de la casa ladraba")).toEqual(["perro", "casa", "ladraba"]);
  });
});
