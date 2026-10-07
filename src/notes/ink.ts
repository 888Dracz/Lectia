// Geometría de la escritura a mano: suavizado de trazos, reconocimiento de
// formas (círculos, líneas y rectángulos "perfectos") y detección de toques
// para el borrador. Todo es puro para poder probarlo.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function bbox(points: number[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x0 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function unionBox(a: Box | null, b: Box): Box {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function padBox(b: Box, px: number, py = px): Box {
  return { x: b.x - px, y: b.y - py, w: b.w + 2 * px, h: b.h + 2 * py };
}

export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Recorta `a` para que quede dentro de `b`. */
export function clipBox(a: Box, b: Box): Box {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
}

/** Transforma los puntos: (x, y) → (ox + x·k, oy + y·k). */
export function transformPoints(points: number[], ox: number, oy: number, k: number): number[] {
  const out = new Array<number>(points.length);
  for (let i = 0; i + 1 < points.length; i += 2) {
    out[i] = ox + points[i] * k;
    out[i + 1] = oy + points[i + 1] * k;
  }
  return out;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Simplifica un trazo (Ramer–Douglas–Peucker) para guardarlo liviano. */
export function simplify(points: number[], tolerance: number): number[] {
  const n = points.length / 2;
  if (n <= 2) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(points[2 * i], points[2 * i + 1], points[2 * a], points[2 * a + 1], points[2 * b], points[2 * b + 1]);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (idx >= 0 && max > tolerance) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[2 * i], points[2 * i + 1]);
  return out;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Camino SVG suave que pasa por los puntos (curvas cuadráticas por los puntos
 * medios). Con `closed` o `straight`, une los puntos con rectas.
 */
export function strokePath(points: number[], straight = false): string {
  const n = points.length / 2;
  if (n === 0) return "";
  if (n === 1) return `M${r2(points[0])} ${r2(points[1])}l0.01 0`;
  if (straight || n === 2) {
    let d = `M${r2(points[0])} ${r2(points[1])}`;
    for (let i = 1; i < n; i++) d += `L${r2(points[2 * i])} ${r2(points[2 * i + 1])}`;
    return d;
  }
  let d = `M${r2(points[0])} ${r2(points[1])}`;
  for (let i = 1; i < n - 1; i++) {
    const x = points[2 * i];
    const y = points[2 * i + 1];
    const mx = (x + points[2 * i + 2]) / 2;
    const my = (y + points[2 * i + 3]) / 2;
    d += `Q${r2(x)} ${r2(y)} ${r2(mx)} ${r2(my)}`;
  }
  d += `L${r2(points[2 * n - 2])} ${r2(points[2 * n - 1])}`;
  return d;
}

export type Shape = "line" | "ellipse" | "rect";

/** Longitud del trazo. */
export function pathLength(points: number[]): number {
  let len = 0;
  for (let i = 2; i + 1 < points.length; i += 2) len += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
  return len;
}

/**
 * Reconoce un trazo hecho a mano como línea, elipse o rectángulo y devuelve
 * sus puntos "limpios". Devuelve null si no se parece a ninguna forma.
 */
export function recognizeShape(points: number[]): { shape: Shape; points: number[] } | null {
  const n = points.length / 2;
  if (n < 4) return null;
  const len = pathLength(points);
  const box = bbox(points);
  const diag = Math.hypot(box.w, box.h);
  if (len < 24 || diag < 18) return null;
  const x0 = points[0];
  const y0 = points[1];
  const xn = points[2 * n - 2];
  const yn = points[2 * n - 1];
  const chord = Math.hypot(xn - x0, yn - y0);

  // Línea: casi todo el recorrido es la cuerda y ningún punto se aleja.
  if (chord / len > 0.9) {
    let max = 0;
    for (let i = 1; i < n - 1; i++) max = Math.max(max, distToSegment(points[2 * i], points[2 * i + 1], x0, y0, xn, yn));
    if (max < Math.max(5, chord * 0.07)) return { shape: "line", points: [x0, y0, xn, yn] };
    return null;
  }

  // Figuras cerradas: el final vuelve cerca del inicio.
  const closed = chord < Math.max(26, diag * 0.32);
  if (!closed || box.w < 14 || box.h < 10) return null;

  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const a = box.w / 2;
  const b = box.h / 2;

  // Elipse: la distancia normalizada al centro es casi constante (≈ 1).
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.hypot((points[2 * i] - cx) / a, (points[2 * i + 1] - cy) / b);
    sum += r;
    sum2 += r * r;
  }
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  if (sd < 0.11 && mean > 0.8 && mean < 1.12) {
    const steps = 56;
    const out: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      out.push(cx + a * Math.cos(t), cy + b * Math.sin(t));
    }
    return { shape: "ellipse", points: out };
  }

  // Rectángulo: los puntos van pegados a los bordes de la caja.
  let near = 0;
  for (let i = 0; i < n; i++) {
    const px = points[2 * i];
    const py = points[2 * i + 1];
    const d = Math.min(Math.abs(px - box.x) / box.w, Math.abs(box.x + box.w - px) / box.w, Math.abs(py - box.y) / box.h, Math.abs(box.y + box.h - py) / box.h);
    if (d < 0.1) near++;
  }
  if (near / n > 0.88) {
    const { x, y, w, h } = box;
    return { shape: "rect", points: [x, y, x + w, y, x + w, y + h, x, y + h, x, y] };
  }
  return null;
}

/** ¿Pasa el trazo a menos de `radius` del punto? (para el borrador) */
export function strokeHit(points: number[], x: number, y: number, radius: number): boolean {
  const n = points.length / 2;
  if (n === 1) return Math.hypot(points[0] - x, points[1] - y) <= radius;
  for (let i = 1; i < n; i++) {
    if (distToSegment(x, y, points[2 * i - 2], points[2 * i - 1], points[2 * i], points[2 * i + 1]) <= radius) return true;
  }
  return false;
}
