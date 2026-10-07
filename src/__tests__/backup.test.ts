import { BACKUP_APP, buildBackupJson, mediaIds, mergeStates, parseBackupJson } from "../backup/backup";
import { defaultState, migrateState } from "../store/state";
import type { BookMeta } from "../books/types";

const book = (id: string, extra: Partial<BookMeta> = {}): BookMeta => ({
  id,
  title: `Libro ${id}`,
  author: "",
  format: "epub",
  fileName: `${id}.epub`,
  fileSize: 10,
  hasCover: false,
  addedAt: 1,
  status: "unread",
  favorite: false,
  collections: [],
  readingMs: 0,
  ...extra,
});

describe("respaldo", () => {
  it("acepta respaldos de Campanita", () => {
    const j = buildBackupJson(defaultState(), false, 1);
    j.manifest.app = "campanita-lector";
    expect(parseBackupJson(JSON.stringify(j)).manifest.books).toBe(0);
  });

  it("ida y vuelta del JSON", () => {
    const s = defaultState();
    s.books.a = book("a");
    s.progress.xp = 420;
    const json = buildBackupJson(s, true, 1000);
    const parsed = parseBackupJson(JSON.stringify(json));
    expect(parsed.manifest).toMatchObject({ app: BACKUP_APP, books: 1, includesFiles: true });
    expect(parsed.state.books.a.title).toBe("Libro a");
    expect(parsed.state.progress.xp).toBe(420);
  });

  it("rechaza archivos que no son respaldos", () => {
    expect(() => parseBackupJson("{}")).toThrow(/no es un respaldo/);
    expect(() => parseBackupJson("no json")).toThrow(/dañado/);
    expect(() => parseBackupJson(JSON.stringify({ manifest: { app: BACKUP_APP, format: 99 } }))).toThrow(/más nueva/);
  });

  it("combina sin perder datos y respeta la posición más reciente", () => {
    const cur = defaultState();
    cur.books.a = book("a", { location: { chapter: 1, fraction: 0, percent: 0.1, updatedAt: 5 } });
    cur.highlights = [{ id: "h1", bookId: "a", chapter: 0, start: 0, end: 4, text: "hola", color: "yellow", style: "highlight", note: "", createdAt: 1 }];
    cur.progress.days["2026-10-01"] = { ms: 1000, pages: 1, words: 0, games: 0, rsvpWords: 0, xp: 1, quests: ["read"] };
    const inc = defaultState();
    inc.books.a = book("a", { location: { chapter: 3, fraction: 0.5, percent: 0.6, updatedAt: 9 } });
    inc.books.b = book("b");
    inc.highlights = [{ id: "h2", bookId: "b", chapter: 0, start: 0, end: 4, text: "chau", color: "blue", style: "underline", note: "", createdAt: 2 }];
    inc.progress.days["2026-10-01"] = { ms: 5000, pages: 0, words: 0, games: 2, rsvpWords: 0, xp: 3, quests: ["games"] };
    inc.progress.xp = 50;
    const m = mergeStates(cur, inc);
    expect(Object.keys(m.books).sort()).toEqual(["a", "b"]);
    expect(m.books.a.location?.chapter).toBe(3);
    expect(m.highlights.map((h) => h.id).sort()).toEqual(["h1", "h2"]);
    expect(m.progress.days["2026-10-01"]).toMatchObject({ ms: 5000, pages: 1, games: 2, quests: ["read", "games"] });
    expect(m.progress.xp).toBe(50);
  });

  it("combina cuadernos, trazos, recortes y la lista por leer", () => {
    const cur = defaultState();
    cur.readingList = [
      { id: "r1", title: "Uno", author: "", note: "", addedAt: 1 },
      { id: "r2", title: "Dos", author: "", note: "", addedAt: 2 },
    ];
    cur.notebooks.a = { bookId: "a", name: "Mío", cover: "bosque", paper: "dots", sticker: "🌿", bookTitle: "A", bookAuthor: "", createdAt: 1, updatedAt: 10 };
    const inc = defaultState();
    inc.readingList = [
      { id: "r2", title: "Dos", author: "", note: "", addedAt: 2 },
      { id: "r3", title: "Tres", author: "", note: "", addedAt: 3 },
    ];
    inc.notebooks.a = { ...cur.notebooks.a, name: "Viejo", updatedAt: 5 };
    inc.notebooks.b = { ...cur.notebooks.a, bookId: "b", name: "Otro", updatedAt: 7 };
    inc.clips = [{ id: "c1", bookId: "a", chapter: 0, view: "flow", fraction: 0, percent: 0, mediaId: "m1", width: 10, height: 10, text: "", caption: "", createdAt: 1 }];
    inc.drawings = [{ id: "d1", bookId: "a", chapter: 0, view: "flow", strokes: [], text: "", mediaId: "m2", fraction: 0, percent: 0, createdAt: 1, updatedAt: 1 }];
    const m = mergeStates(cur, inc);
    expect(m.readingList.map((i) => i.id)).toEqual(["r1", "r2", "r3"]);
    expect(m.notebooks.a.name).toBe("Mío");
    expect(m.notebooks.b.name).toBe("Otro");
    expect(m.clips).toHaveLength(1);
    expect(mediaIds(m).sort()).toEqual(["m1", "m2"]);
  });

  it("migra estados incompletos con valores por defecto", () => {
    const s = migrateState({ books: { x: { id: "x", title: "X" } }, reader: { fontSize: 22 } });
    expect(s.books.x.collections).toEqual([]);
    expect(s.reader.fontSize).toBe(22);
    expect(s.reader.theme).toBe("paper");
    expect(s.progress.days).toEqual({});
    expect(s.readingList).toEqual([]);
    expect(s.notebooks).toEqual({});
    expect(s.reader.markStyle).toBe("highlight");
  });

  it("los subrayados de la versión anterior pasan a ser resaltados", () => {
    const s = migrateState({ highlights: [{ id: "h", bookId: "x", chapter: 0, start: 0, end: 3, text: "abc", color: "pink", note: "", createdAt: 1 }] });
    expect(s.highlights[0].style).toBe("highlight");
    expect(s.highlights[0].color).toBe("pink");
  });
});
