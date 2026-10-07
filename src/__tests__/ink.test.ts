import { bbox, clipBox, padBox, recognizeShape, simplify, strokeHit, strokePath, transformPoints } from "../notes/ink";

const circle = (cx: number, cy: number, r: number, n = 40, wobble = 0) => {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const k = 1 + (i % 2 ? wobble : -wobble);
    pts.push(cx + r * k * Math.cos(t), cy + r * k * Math.sin(t));
  }
  return pts;
};

describe("trazos a mano", () => {
  it("calcula cajas y las ajusta", () => {
    expect(bbox([10, 20, 30, 5, 15, 40])).toEqual({ x: 10, y: 5, w: 20, h: 35 });
    expect(padBox({ x: 10, y: 10, w: 5, h: 5 }, 2)).toEqual({ x: 8, y: 8, w: 9, h: 9 });
    expect(clipBox({ x: -5, y: 0, w: 20, h: 20 }, { x: 0, y: 5, w: 10, h: 10 })).toEqual({ x: 0, y: 5, w: 10, h: 10 });
  });

  it("transforma puntos de em a píxeles", () => {
    expect(transformPoints([1, 2], 100, 50, 10)).toEqual([110, 70]);
  });

  it("reconoce un círculo dibujado a mano como elipse", () => {
    const r = recognizeShape(circle(100, 100, 50, 40, 0.04));
    expect(r?.shape).toBe("ellipse");
    const b = bbox(r!.points);
    expect(b.w).toBeGreaterThan(90);
    expect(b.w).toBeLessThan(112);
  });

  it("reconoce una línea recta", () => {
    const pts: number[] = [];
    for (let i = 0; i <= 20; i++) pts.push(i * 10, 50 + (i % 2 ? 1.5 : -1.5));
    const r = recognizeShape(pts);
    expect(r?.shape).toBe("line");
    expect(r?.points).toHaveLength(4);
  });

  it("reconoce un rectángulo", () => {
    const pts: number[] = [];
    const edge = (x0: number, y0: number, x1: number, y1: number) => {
      for (let i = 0; i < 10; i++) pts.push(x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10);
    };
    edge(0, 0, 200, 0);
    edge(200, 0, 200, 100);
    edge(200, 100, 0, 100);
    edge(0, 100, 0, 3);
    pts.push(2, 2);
    expect(recognizeShape(pts)?.shape).toBe("rect");
  });

  it("deja tal cual un garabato", () => {
    const pts = [0, 0, 40, 60, 10, 90, 80, 20, 120, 100, 30, 140];
    expect(recognizeShape(pts)).toBeNull();
  });

  it("simplifica sin perder los extremos", () => {
    const pts: number[] = [];
    for (let i = 0; i <= 100; i++) pts.push(i, 0);
    const s = simplify(pts, 0.5);
    expect(s).toEqual([0, 0, 100, 0]);
  });

  it("arma caminos SVG suaves", () => {
    expect(strokePath([0, 0])).toMatch(/^M0 0/);
    expect(strokePath([0, 0, 10, 10, 20, 0])).toContain("Q");
    expect(strokePath([0, 0, 10, 10, 20, 0], true)).not.toContain("Q");
  });

  it("detecta qué trazo toca el borrador", () => {
    const line = [0, 0, 100, 0];
    expect(strokeHit(line, 50, 4, 5)).toBe(true);
    expect(strokeHit(line, 50, 12, 5)).toBe(false);
  });
});
