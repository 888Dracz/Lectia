import { estimateList, findWishFor, formatSpan, isActiveItem, minutesLeft, moveActive, normalizeTitle, readingWpm } from "../notes/readingList";
import type { ReadingListItem } from "../store/state";
import type { BookMeta } from "../books/types";

const item = (id: string, extra: Partial<ReadingListItem> = {}): ReadingListItem => ({ id, title: `Libro ${id}`, author: "", note: "", addedAt: 1, ...extra });

const book = (id: string, extra: Partial<BookMeta> = {}): BookMeta => ({
  id,
  title: id,
  author: "",
  format: "epub",
  fileName: `${id}.epub`,
  fileSize: 1,
  hasCover: false,
  addedAt: 1,
  status: "unread",
  favorite: false,
  collections: [],
  readingMs: 0,
  ...extra,
});

describe("lista por leer", () => {
  it("reordena solo los pendientes y deja leídos y descartados al final", () => {
    const list = [item("a"), item("b"), item("x", { doneAt: 5 }), item("c"), item("y", { discardedAt: 3 })];
    const moved = moveActive(list, "c", 0);
    expect(moved.map((i) => i.id)).toEqual(["c", "a", "b", "x", "y"]);
    expect(moveActive(moved, "c", 99).filter(isActiveItem).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(moveActive(list, "nope", 0)).toBe(list);
  });

  it("vincula deseos con libros recién agregados", () => {
    const list = [item("w", { title: "El túnel" }), item("v", { title: "Rayuela", bookId: "r" })];
    expect(normalizeTitle("¡El Túnel!")).toBe("el tunel");
    expect(findWishFor(list, "El Tunel")?.id).toBe("w");
    expect(findWishFor(list, "Rayuela")).toBeUndefined();
    expect(findWishFor(list, "Otro libro")).toBeUndefined();
  });

  it("estima el tiempo de lectura de la lista", () => {
    const books = { a: book("a", { wordCount: 23000 }), b: book("b", { wordCount: 46000, location: { chapter: 0, fraction: 0, percent: 0.5, updatedAt: 1 } }) };
    expect(minutesLeft(books.a, 230)).toBe(100);
    expect(minutesLeft(books.b, 230)).toBe(100);
    const est = estimateList([item("1", { bookId: "a" }), item("2", { bookId: "b" }), item("3")], books, 230, 20);
    expect(est).toEqual({ minutes: 200, known: 2, unknown: 1, days: 10 });
  });

  it("usa la velocidad medida en los tests", () => {
    expect(readingWpm([])).toBe(230);
    expect(readingWpm([{ wpm: 200 }, { wpm: 300 }, { wpm: 260 }])).toBe(260);
  });

  it("formatea plazos", () => {
    expect(formatSpan(1)).toBe("1 día");
    expect(formatSpan(9)).toBe("9 días");
    expect(formatSpan(21)).toBe("3 semanas");
    expect(formatSpan(90)).toBe("3 meses");
    expect(formatSpan(400)).toBe("1 año");
  });
});
