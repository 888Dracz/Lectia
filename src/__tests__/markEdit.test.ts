import {
  applyMarkEdit,
  covers,
  invertMarkEdit,
  markSpan,
  marksIn,
  recolorSpan,
  stylesOn,
  unmarkSpan,
} from "../notes/markEdit";
import { withNotebooks } from "../notes/notebook";
import type { Highlight, MarkStyle } from "../store/state";

//            0         1         2         3         4
//            0123456789012345678901234567890123456789012345
const SOURCE = "En un lugar de la Mancha de cuyo nombre no quiero";

const mk = (id: string, start: number, end: number, style: MarkStyle = "highlight", extra: Partial<Highlight> = {}): Highlight => ({
  id,
  bookId: "b",
  chapter: 0,
  start,
  end,
  text: SOURCE.slice(start, end).trim(),
  color: "yellow",
  style,
  note: "",
  createdAt: 1,
  ...extra,
});

const span = (start: number, end: number) => ({ bookId: "b", chapter: 0, start, end });

describe("marcas: poner y quitar", () => {
  it("encuentra solo las marcas vigentes del mismo capítulo que tocan el tramo", () => {
    const list = [mk("a", 0, 5), mk("b", 6, 11), mk("c", 6, 11, "bold", { chapter: 1 }), mk("d", 6, 11, "bold", { discardedAt: 5 })];
    expect(marksIn(list, span(3, 8)).map((h) => h.id)).toEqual(["a", "b"]);
    expect(marksIn(list, span(3, 8), "bold")).toEqual([]);
  });

  it("sabe si una forma cubre toda la selección (sin contar espacios)", () => {
    const list = [mk("a", 0, 5, "bold"), mk("b", 6, 11, "bold")];
    expect(covers(list, span(0, 11), SOURCE)).toBe(true);
    expect(covers(list, span(0, 14), SOURCE)).toBe(false);
    expect(stylesOn([...list, mk("c", 3, 8, "underline")], span(0, 11), SOURCE)).toEqual(new Set(["bold"]));
  });

  it("quitar la negrita de toda la marca la borra", () => {
    const list = [mk("a", 3, 11, "bold")];
    const edit = unmarkSpan(list, span(3, 11), SOURCE, "bold");
    expect(applyMarkEdit(list, edit)).toEqual([]);
  });

  it("quitar el medio de una marca la parte en dos y la nota queda en la primera parte", () => {
    const list = [mk("a", 0, 24, "underline", { note: "ojo" })];
    const edit = unmarkSpan(list, span(6, 11), SOURCE, "underline");
    const out = applyMarkEdit(list, edit).sort((x, y) => x.start - y.start);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "a", start: 0, end: 5, text: "En un", note: "ojo" });
    expect(out[1]).toMatchObject({ start: 12, end: 24, text: "de la Mancha", note: "" });
    expect(out[1].id).not.toBe("a");
  });

  it("quitar una forma no toca las otras; sin forma se quitan todas", () => {
    const list = [mk("a", 3, 11, "bold"), mk("b", 3, 11, "highlight")];
    expect(applyMarkEdit(list, unmarkSpan(list, span(3, 11), SOURCE, "bold")).map((h) => h.id)).toEqual(["b"]);
    expect(applyMarkEdit(list, unmarkSpan(list, span(3, 11), SOURCE))).toEqual([]);
  });

  it("deshacer devuelve la lista como estaba", () => {
    const list = [mk("a", 0, 24, "underline"), mk("z", 30, 40)];
    const edit = unmarkSpan(list, span(6, 11), SOURCE);
    const after = applyMarkEdit(list, edit);
    const back = applyMarkEdit(after, invertMarkEdit(edit)).sort((x, y) => x.start - y.start);
    expect(back).toEqual(list);
  });

  it("poner una forma sobre otra igual las funde en una sola, sin apilar", () => {
    const list = [mk("a", 0, 5, "bold", { note: "uno" }), mk("b", 12, 17, "bold", { note: "dos" })];
    const { edit, mark } = markSpan(list, span(3, 14), SOURCE, "bold", "blue");
    const out = applyMarkEdit(list, edit);
    expect(out).toHaveLength(1);
    expect(mark).toMatchObject({ id: "a", start: 0, end: 17, color: "blue", note: "uno\n\ndos", text: "En un lugar de la" });
  });

  it("poner una forma nueva recorta los espacios de los bordes", () => {
    const { mark } = markSpan([], span(5, 12), SOURCE, "highlight", "yellow", 0.3);
    expect(mark).toMatchObject({ start: 6, end: 11, text: "lugar", percent: 0.3 });
    expect(markSpan([], span(5, 6), SOURCE, "highlight", "yellow").mark).toBeNull();
  });

  it("cambiar el color solo afecta a la forma elegida", () => {
    const list = [mk("a", 3, 11, "bold"), mk("b", 3, 11, "highlight")];
    const out = applyMarkEdit(list, recolorSpan(list, span(3, 11), "bold", "pink"));
    expect(out.find((h) => h.id === "a")?.color).toBe("pink");
    expect(out.find((h) => h.id === "b")?.color).toBe("yellow");
  });
});

describe("cuadernos en la biblioteca", () => {
  it("pone cada cuaderno junto a su libro y los huérfanos al final", () => {
    const books = [{ id: "x" }, { id: "y" }, { id: "z" }];
    const items = withNotebooks(books, (id) => id !== "y", ["gone"]);
    expect(items.map((i) => (i.kind === "book" ? i.book.id : `nb:${i.bookId}`))).toEqual(["x", "nb:x", "y", "z", "nb:z", "nb:gone"]);
  });
});
