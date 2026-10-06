// @vitest-environment jsdom
import { strToU8, zipSync } from "fflate";
import { loadEpub, resolvePath } from "../books/formats/epub";
import { loadFb2 } from "../books/formats/fb2";
import { isTxtHeading, loadTxt, markdownToBook, paragraphsToChapters, textToParagraphs, decodeText } from "../books/formats/text";
import { splitHtmlIntoChapters, htmlToFlatText, sanitizeHtml } from "../books/html";

const buf = (u8: Uint8Array) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

function makeEpub(): ArrayBuffer {
  const files = {
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(
      `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
    ),
    "OEBPS/content.opf": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>El faro</dc:title><dc:creator>Ana Pérez</dc:creator><dc:language>es</dc:language></metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="Text/cap%201.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="Text/cap2.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`),
    "OEBPS/nav.xhtml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>
<nav epub:type="toc"><ol><li><a href="Text/cap%201.xhtml">Capítulo uno</a></li><li><a href="Text/cap2.xhtml#s2">Capítulo dos</a></li></ol></nav></body></html>`),
    "OEBPS/Text/cap 1.xhtml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>1</title><style>p{color:red}</style></head><body>
<h1>Capítulo uno</h1><p style="text-align:center">Había un faro.</p><a id="p2"/><p>Y una <a href="cap2.xhtml#s2">nota</a>.</p><script>alert(1)</script></body></html>`),
    "OEBPS/Text/cap2.xhtml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1 id="s2">Capítulo dos</h1><p onclick="x()">Fin.</p></body></html>`),
  };
  return buf(zipSync(files));
}

describe("EPUB", () => {
  it("resuelve rutas relativas", () => {
    expect(resolvePath("OEBPS/Text/", "../Images/a%20b.jpg")).toBe("OEBPS/Images/a b.jpg");
    expect(resolvePath("", "/x/y.html#z")).toBe("x/y.html");
  });

  it("lee metadatos, índice y capítulos limpios", async () => {
    const { content, info } = await loadEpub(makeEpub());
    expect(info).toMatchObject({ title: "El faro", author: "Ana Pérez", language: "es" });
    if (content.kind !== "reflow") throw new Error("tipo");
    expect(content.chapters.map((c) => c.title)).toEqual(["Capítulo uno", "Capítulo dos"]);
    expect(content.toc[1]).toMatchObject({ chapter: 1, anchor: "s2" });
    const html = await content.getHtml(0);
    expect(html).toContain("Había un faro.");
    expect(html).toContain('data-a="c"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("style=");
    // <a id="p2"/> no debe tragarse el párrafo siguiente
    expect(html).toMatch(/<a id="p2"><\/a>/);
    expect(await content.getHtml(1)).not.toContain("onclick");
    expect(content.resolveHref?.("cap2.xhtml#s2", 0)).toEqual({ chapter: 1, anchor: "s2" });
    expect(await content.getText(1)).toBe("Capítulo dos\n\nFin.");
  });
});

describe("TXT y Markdown", () => {
  it("decodifica Latin-1 si no es UTF-8", () => {
    const bytes = new Uint8Array([0x63, 0x61, 0x6e, 0x63, 0x69, 0xf3, 0x6e]);
    expect(decodeText(bytes.buffer)).toBe("canción");
  });

  it("une líneas cortadas a mano y detecta capítulos", async () => {
    const txt = "Title: Prueba\nAuthor: Juan\n\nCAPÍTULO I\n\nEra una\nvez un gato.\n\nCAPÍTULO II\n\nY se fue.";
    expect(textToParagraphs(txt)).toContain("Era una vez un gato.");
    expect(isTxtHeading("CAPÍTULO II")).toBe(true);
    expect(isTxtHeading("Era una vez un gato que vivía en una casa enorme y muy vieja.")).toBe(false);
    const { content, info } = await loadTxt(buf(strToU8(txt)), "prueba");
    expect(info).toMatchObject({ title: "Prueba", author: "Juan" });
    if (content.kind !== "reflow") throw new Error("tipo");
    expect(content.chapters.map((c) => c.title)).toEqual(["Inicio", "CAPÍTULO I", "CAPÍTULO II"]);
  });

  it("parte textos largos sin capítulos", () => {
    const paras = Array.from({ length: 200 }, (_, i) => `Párrafo ${i} `.repeat(40));
    const ch = paragraphsToChapters(paras, "Libro");
    expect(ch.length).toBeGreaterThan(2);
    expect(ch[0].title).toBe("Parte 1");
  });

  it("Markdown se divide por los encabezados que se repiten", () => {
    const { content, info } = markdownToBook("# Guía\n\nAutor: Lectia\n\n## Uno\n\nTexto.\n\n## Dos\n\nMás.", "x");
    expect(info).toMatchObject({ title: "Guía", author: "Lectia" });
    if (content.kind !== "reflow") throw new Error("tipo");
    expect(content.chapters.map((c) => c.title)).toEqual(["Inicio", "Uno", "Dos"]);
  });
});

describe("FB2", () => {
  it("lee secciones, metadatos y notas", async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description><title-info><author><first-name>Rosa</first-name><last-name>Luna</last-name></author><book-title>Cuentos</book-title><lang>es</lang></title-info></description>
<body><section><title><p>Uno</p></title><p>Hola <emphasis>mundo</emphasis><a l:href="#n1">1</a>.</p></section><section><title><p>Dos</p></title><p>Adiós.</p></section></body>
<body name="notes"><section id="n1"><p>Una nota.</p></section></body>
</FictionBook>`;
    const { content, info } = await loadFb2(buf(strToU8(xml)), "x");
    expect(info).toMatchObject({ title: "Cuentos", author: "Rosa Luna", language: "es" });
    if (content.kind !== "reflow") throw new Error("tipo");
    expect(content.chapters.map((c) => c.title)).toEqual(["Uno", "Dos", "Notas"]);
    expect(await content.getHtml(0)).toContain("<em>mundo</em>");
    expect(content.resolveHref?.("#n1", 0)).toEqual({ chapter: 2, anchor: "n1" });
  });
});

describe("HTML", () => {
  it("divide por encabezados y limpia", () => {
    const html = sanitizeHtml('<h2>A</h2><p>uno</p><h2>B</h2><p>dos<img src="https://x.com/a.png"></p><iframe src="x"></iframe>');
    expect(html).not.toContain("iframe");
    expect(html).not.toContain("https://x.com");
    const ch = splitHtmlIntoChapters(html, "x");
    expect(ch.map((c) => c.title)).toEqual(["A", "B"]);
    expect(htmlToFlatText(ch[1].html)).toBe("Bdos");
  });
});
