// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { loadMobi, palmDocDecompress, trailingSize } from "../books/formats/mobi";
import { filterBookStyle, sanitizeHtml, setEngineOptions } from "../books/html";
import type { BookMeta } from "../books/types";
import { minutesFor, readingWpm, remainingWords, formatMinutes, historyRows } from "../lib/stats";
import { defaultState, migrateState } from "../store/state";
import { buildPayload, mergePayload } from "../sync/sync";
import { bionicLength, focusSegments, footnoteOf, isNoteLink } from "../ui/reader/focus";
import { kelvinToRgb } from "../ui/reader/themes";

const book = (id: string, extra: Partial<BookMeta> = {}): BookMeta => ({
  id,
  title: `Libro ${id}`,
  author: "",
  format: "epub",
  fileName: "libro.epub",
  fileSize: 1234,
  hasCover: false,
  addedAt: 1,
  status: "unread",
  favorite: false,
  collections: [],
  readingMs: 0,
  ...extra,
});

/** Arma un MOBI mínimo: cabecera Palm, registro 0 con MOBI + EXTH y un registro de texto. */
function makeMobi(html: string): ArrayBuffer {
  const enc = new TextEncoder();
  const text = enc.encode(html);
  const exthRecs = [
    [100, enc.encode("Ana Pérez")],
    [503, enc.encode("El faro")],
  ] as const;
  const exthLen = 12 + exthRecs.reduce((a, [, v]) => a + 8 + v.length, 0);
  const mobiLen = 232;
  const r0 = new Uint8Array(16 + mobiLen + exthLen);
  const d0 = new DataView(r0.buffer);
  d0.setUint16(0, 1); // sin compresión
  d0.setUint32(4, text.length);
  d0.setUint16(8, 1); // un registro de texto
  d0.setUint16(10, 4096);
  r0.set(enc.encode("MOBI"), 16);
  d0.setUint32(20, mobiLen);
  d0.setUint32(28, 65001);
  d0.setUint32(36, 6);
  d0.setUint32(108, 0xffffffff);
  d0.setUint32(128, 0x40);
  let p = 16 + mobiLen;
  r0.set(enc.encode("EXTH"), p);
  d0.setUint32(p + 4, exthLen);
  d0.setUint32(p + 8, exthRecs.length);
  p += 12;
  for (const [t, v] of exthRecs) {
    d0.setUint32(p, t);
    d0.setUint32(p + 4, 8 + v.length);
    r0.set(v, p + 8);
    p += 8 + v.length;
  }
  const records = [r0, text];
  const headerLen = 78 + records.length * 8 + 2;
  const total = headerLen + records.reduce((a, r) => a + r.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  out.set(enc.encode("libro"), 0);
  out.set(enc.encode("BOOKMOBI"), 60);
  dv.setUint16(76, records.length);
  let off = headerLen;
  records.forEach((r, i) => {
    dv.setUint32(78 + i * 8, off);
    out.set(r, off);
    off += r.length;
  });
  return out.buffer;
}

describe("Kindle (MOBI)", () => {
  it("descomprime PalmDOC (literales, espacios y copias)", () => {
    // "abc" + copia de distancia 3 y largo 3 → "abcabc"; 0xC1 → " A"
    const pair = (3 << 3) | (3 - 3);
    const src = Uint8Array.from([0x61, 0x62, 0x63, 0x80 | (pair >> 8), pair & 0xff, 0xc1]);
    expect(new TextDecoder().decode(palmDocDecompress(src))).toBe("abcabc A");
  });

  it("calcula los bytes extra al final de un registro", () => {
    // bit 0 (multibyte): el último byte indica 1 + (b & 3) bytes extra.
    expect(trailingSize(Uint8Array.from([1, 2, 3, 0x01]), 1)).toBe(2);
    expect(trailingSize(Uint8Array.from([1, 2, 3]), 0)).toBe(0);
  });

  it("lee título, autor y capítulos separados por saltos de página", async () => {
    const { content, info } = await loadMobi(
      makeMobi("<html><body><h1>Uno</h1><p>Había un faro.</p><mbp:pagebreak/><h1>Dos</h1><p>Fin.</p></body></html>"),
      "archivo"
    );
    expect(info.title).toBe("El faro");
    expect(info.author).toBe("Ana Pérez");
    expect(content.kind).toBe("reflow");
    if (content.kind !== "reflow") return;
    expect(content.chapters.map((c) => c.title)).toEqual(["Uno", "Dos"]);
    expect(await content.getText(0)).toContain("Había un faro.");
  });
});

describe("motor: estilos y limpieza", () => {
  it("filtra el CSS del libro: forma sí, colores y tamaños absolutos no", () => {
    expect(filterBookStyle("color:red; text-indent:2em; font-size:12px; font-family:Foo", false)).toBe("text-indent:2em");
    expect(filterBookStyle("font-family:Foo; background:url(x)", true)).toBe("font-family:Foo");
  });

  it("respeta estilos en línea solo si se activa", () => {
    setEngineOptions({ bookStyles: false, publisherFonts: false, cleanEmptyLines: false, cleanSpaces: false });
    expect(sanitizeHtml('<p style="text-indent:3em">a</p>')).not.toContain("style");
    setEngineOptions({ bookStyles: true, publisherFonts: false, cleanEmptyLines: false, cleanSpaces: false });
    expect(sanitizeHtml('<p style="text-indent:3em;color:red">a</p>')).toContain('style="text-indent:3em"');
    setEngineOptions({ bookStyles: false, publisherFonts: false, cleanEmptyLines: true, cleanSpaces: true });
    const out = sanitizeHtml("<p>  Hola    mundo</p><p>&nbsp;</p><p>Fin</p>");
    expect(out).toBe("<p>Hola mundo</p><p>Fin</p>");
    setEngineOptions({ bookStyles: false, publisherFonts: false, cleanEmptyLines: false, cleanSpaces: false });
  });

  it("marca saltos de página impresos y notas", () => {
    const doc = new DOMParser().parseFromString('<body><span role="doc-pagebreak" id="p12" title="12"></span><a role="doc-noteref" href="#n1">1</a></body>', "text/html");
    // markSemantics corre dentro de preserveInlineFormatting en los formatos.
    return import("../books/html").then(({ markSemantics }) => {
      markSemantics(doc);
      expect(doc.querySelector("[data-pb]")?.getAttribute("data-pb")).toBe("12");
      expect(doc.querySelector("a")?.dataset.noteref).toBe("1");
    });
  });
});

describe("lectura enfocada", () => {
  it("resalta el inicio de las palabras sin cambiar el texto", () => {
    const { segments } = focusSegments("Hola mundo, sí.", { bionic: true, ratio: 0.5, sentenceStart: false }, true);
    expect(segments.map((s) => s.text).join("")).toBe("Hola mundo, sí.");
    expect(segments.filter((s) => s.kind === "bionic").map((s) => s.text)).toEqual(["Ho", "mun", "s"]);
    expect(bionicLength("a", 0.5)).toBe(1);
  });

  it("marca la primera palabra de cada oración", () => {
    const { segments } = focusSegments("Era tarde. Llovía mucho. ¿Vienes?", { bionic: false, ratio: 0.5, sentenceStart: true }, true);
    expect(segments.filter((s) => s.kind === "first").map((s) => s.text)).toEqual(["Era", "Llovía", "Vienes"]);
  });

  it("detecta llamadas a notas y su texto", () => {
    document.body.innerHTML = '<p>Texto<sup><a href="#n1">1</a></sup></p><aside id="n1">La nota.</aside><a href="#cap">Capítulo</a>';
    const links = document.querySelectorAll("a");
    expect(isNoteLink(links[0])).toBe(true);
    expect(isNoteLink(links[1])).toBe(false);
    expect(footnoteOf(document.body, "n1")).toBe("La nota.");
  });

  it("convierte la temperatura de color en un tono cálido", () => {
    expect(kelvinToRgb(1000)).toMatch(/^rgb\(255, \d+, 0\)$/);
    expect(kelvinToRgb(6500)).toMatch(/^rgb\(255, 2[45]\d, 2[345]\d\)$/);
  });
});

describe("estadísticas del libro", () => {
  it("calcula velocidad, restante y el historial", () => {
    const b = book("a", {
      wordCount: 10000,
      history: { "2026-10-01": { ms: 20 * 60000, from: 0, to: 0.5 }, "2026-10-02": { ms: 0, from: 0.5, to: 0.5 } },
    });
    expect(readingWpm(b)).toEqual({ wpm: 250, measured: true });
    expect(readingWpm(book("b")).measured).toBe(false);
    const left = remainingWords(10000, [1, 1], 1, 0.5, 0.75);
    expect(left).toEqual({ chapter: 2500, book: 2500 });
    expect(formatMinutes(minutesFor(2500, 250))).toBe("10 min");
    expect(formatMinutes(125)).toBe("2 h 5 min");
    expect(historyRows(b)[0].day).toBe("2026-10-02");
    expect(historyRows(b)[1].wpm).toBe(250);
  });
});

describe("sincronización", () => {
  it("empareja libros por archivo y suma marcadores; gana la posición más reciente", () => {
    const here = { ...defaultState(), books: { local: book("local", { location: { chapter: 1, fraction: 0, percent: 0.1, updatedAt: 10 } }) } };
    const there = {
      ...defaultState(),
      books: { otro: book("otro", { location: { chapter: 5, fraction: 0.2, percent: 0.6, updatedAt: 20 }, readingMs: 5000 }) },
      bookmarks: [{ id: "bm1", bookId: "otro", chapter: 5, fraction: 0.2, percent: 0.6, label: "x", createdAt: 1 }],
    };
    const { state, matched } = mergePayload(here, buildPayload(there));
    expect(matched).toBe(1);
    expect(state.books.local.location?.chapter).toBe(5);
    expect(state.books.local.readingMs).toBe(5000);
    expect(state.bookmarks).toHaveLength(1);
    expect(state.bookmarks[0].bookId).toBe("local");
  });

  it("los ajustes antiguos reciben los valores nuevos por defecto", () => {
    const s = migrateState({ reader: { fontSize: 22, toolbarItems: ["toc", "nada"] }, app: { theme: "dark" } });
    expect(s.reader.fontSize).toBe(22);
    expect(s.reader.toolbarItems).toEqual(["toc"]);
    expect(s.reader.footnotes).toBe("popup");
    expect(s.app.sync.provider).toBe("none");
    expect(s.app.dictionary).toEqual([]);
  });
});
