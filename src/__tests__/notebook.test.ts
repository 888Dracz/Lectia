import {
  collectEntries,
  countByFilter,
  defaultNotebookName,
  groupByChapter,
  groupByType,
  matchesFilter,
  notebookMarkdown,
  quoteOfTheDay,
  resolveNotebook,
  searchEntries,
} from "../notes/notebook";
import { defaultState, type Highlight, type MarkStyle } from "../store/state";

const hl = (id: string, style: MarkStyle, chapter: number, start: number, extra: Partial<Highlight> = {}): Highlight => ({
  id,
  bookId: "b",
  chapter,
  start,
  end: start + 5,
  text: `Texto número ${id} para probar`,
  color: "yellow",
  style,
  note: "",
  createdAt: start,
  ...extra,
});

function sample() {
  const s = defaultState();
  s.highlights = [
    hl("h1", "highlight", 1, 50),
    hl("h2", "underline", 0, 10, { note: "me encantó" }),
    hl("h3", "bold", 0, 5),
    hl("h4", "highlight", 0, 80, { discardedAt: 9 }),
    hl("h5", "box", 0, 1, { bookId: "otro" }),
  ];
  s.clips = [{ id: "c1", bookId: "b", chapter: 1, view: "flow", fraction: 0.2, percent: 0.6, mediaId: "m", width: 10, height: 5, text: "recorte", caption: "Mapa", createdAt: 3 }];
  s.looseNotes = [{ id: "n1", bookId: "b", text: "Idea suelta", tint: "mint", createdAt: 4, updatedAt: 4 }];
  return s;
}

describe("cuadernos", () => {
  it("reúne las entradas de un libro y las cuenta por forma", () => {
    const e = collectEntries(sample(), "b");
    expect(e).toHaveLength(6);
    const c = countByFilter(e);
    expect(c).toMatchObject({ all: 5, discarded: 1, highlight: 1, underline: 1, bold: 1, clip: 1, note: 1, drawing: 0 });
  });

  it("separa lo remarcado según cómo se hizo", () => {
    const live = collectEntries(sample(), "b").filter((e) => matchesFilter(e, "all"));
    const sections = groupByType(live);
    expect(sections.map((s) => s.title)).toEqual(["Resaltados", "Subrayados", "En negrita", "Recortes", "Notas sueltas"]);
  });

  it("los descartados solo aparecen en su filtro", () => {
    const e = collectEntries(sample(), "b");
    expect(e.filter((x) => matchesFilter(x, "discarded")).map((x) => x.id)).toEqual(["h4"]);
    expect(e.filter((x) => matchesFilter(x, "highlight")).map((x) => x.id)).toEqual(["h1"]);
  });

  it("agrupa por capítulo en orden de lectura", () => {
    const live = collectEntries(sample(), "b").filter((e) => matchesFilter(e, "all"));
    const sections = groupByChapter(live, (c) => `Cap ${c + 1}`);
    expect(sections.map((s) => s.title)).toEqual(["Cap 1", "Cap 2", "Notas generales"]);
    expect(sections[0].entries.map((e) => e.id)).toEqual(["h3", "h2"]);
  });

  it("busca en textos, notas y pies de foto", () => {
    const e = collectEntries(sample(), "b");
    expect(searchEntries(e, "encanto").map((x) => x.id)).toEqual(["h2"]);
    expect(searchEntries(e, "mapa").map((x) => x.id)).toEqual(["c1"]);
  });

  it("da nombre y tapa por defecto, y respeta lo personalizado", () => {
    const nb = resolveNotebook(undefined, "b", { title: "Rayuela", author: "Cortázar" }, 1);
    expect(nb.name).toBe(defaultNotebookName("Rayuela"));
    expect(nb.name).toBe("Notas de «Rayuela»");
    expect(resolveNotebook({ ...nb, name: "Mi cuaderno" }, "b", undefined).name).toBe("Mi cuaderno");
  });

  it("exporta a Markdown con cada forma de remarcar", () => {
    const md = notebookMarkdown({
      notebook: resolveNotebook(undefined, "b", { title: "Libro", author: "" }, 1),
      entries: collectEntries(sample(), "b"),
      chapterTitle: (c) => `Cap ${c + 1}`,
      date: "hoy",
      images: { m: "imagenes/m.png" },
    });
    expect(md).toContain("## Resaltados");
    expect(md).toContain("==Texto número h1 para probar==");
    expect(md).toContain("**Texto número h3 para probar**");
    expect(md).toContain("📝 me encantó");
    expect(md).toContain("![Mapa](imagenes/m.png)");
    expect(md).not.toContain("h4");
  });

  it("elige la misma frase del día durante todo el día", () => {
    const s = sample();
    const a = quoteOfTheDay(s.highlights, "2026-10-06");
    expect(a).toBeDefined();
    expect(quoteOfTheDay(s.highlights, "2026-10-06")).toBe(a);
    expect(a?.discardedAt).toBeUndefined();
  });
});
