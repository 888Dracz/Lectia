import { locationFromPercent, percentFromSizes } from "../books/types";
import { linesToParagraphs } from "../books/formats/pdf";

describe("posición de lectura", () => {
  const sizes = [100, 300, 600];

  it("convierte capítulo + fracción a porcentaje", () => {
    expect(percentFromSizes(sizes, 0, 0)).toBe(0);
    expect(percentFromSizes(sizes, 1, 0)).toBeCloseTo(0.1);
    expect(percentFromSizes(sizes, 2, 1)).toBe(1);
  });

  it("ida y vuelta entre porcentaje y posición", () => {
    for (const p of [0, 0.05, 0.2, 0.55, 0.99]) {
      const l = locationFromPercent(sizes, p);
      expect(percentFromSizes(sizes, l.chapter, l.fraction)).toBeCloseTo(p, 3);
    }
  });
});

describe("texto de PDF", () => {
  it("une líneas en párrafos y repara guiones", () => {
    const lines = [
      "Había una vez un pueblo muy pequeño situado al pie de una monta-",
      "ña donde vivía una niña que leía libros todas las noches sin parar.",
      "Fin del primer párrafo.",
      "",
      "Segundo párrafo que empieza aquí y continúa con más palabras en la línea",
      "y termina en esta otra línea corta.",
    ];
    const p = linesToParagraphs(lines);
    expect(p).toHaveLength(2);
    expect(p[0]).toContain("montaña");
    expect(p[0]).toMatch(/Fin del primer párrafo\.$/);
  });
});

describe("párrafos de PDF por posición", () => {
  it("separa párrafos por el espacio vertical y los títulos por tamaño", async () => {
    const { itemsToParagraphs } = await import("../books/formats/pdf");
    const line = (str: string, y: number, h = 10) => ({ str, hasEOL: true, transform: [h, 0, 0, h, 50, y], height: h });
    const items = [
      line("Capítulo 1", 800, 20),
      line("Primera línea del primer párrafo que es larga como las demás", 760),
      line("y aquí termina el primer párrafo de la página actual.", 746),
      line("Segundo párrafo que empieza después de un espacio mayor de lo normal", 720),
      line("y que también termina con un punto final.", 706),
    ];
    expect(itemsToParagraphs(items)).toEqual([
      "Capítulo 1",
      "Primera línea del primer párrafo que es larga como las demás y aquí termina el primer párrafo de la página actual.",
      "Segundo párrafo que empieza después de un espacio mayor de lo normal y que también termina con un punto final.",
    ]);
  });
});
