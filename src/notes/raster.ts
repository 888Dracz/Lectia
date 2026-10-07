// "Capturas" de una parte de la página: dibuja en un lienzo lo que se ve en el
// lector (texto, subrayados, imágenes y trazos a mano) sin depender de una
// captura de pantalla del sistema. El texto se vuelve a escribir con las
// mismas fuentes y en la misma posición que tiene en pantalla.
import type { Box } from "./ink";
import { HIGHLIGHT_COLORS } from "./marks";
import type { HighlightColor } from "../store/state";

export interface InkPaint {
  d: string;
  color: string;
  width: number;
  tool: "pen" | "marker";
}

interface Origin {
  left: number;
  top: number;
}

const MAX_PIXELS = 6_000_000;

function makeCanvas(region: Box, scale: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; scale: number } {
  let s = scale;
  if (region.w * region.h * s * s > MAX_PIXELS) s = Math.sqrt(MAX_PIXELS / Math.max(1, region.w * region.h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(region.w * s));
  canvas.height = Math.max(1, Math.round(region.h * s));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la imagen.");
  ctx.scale(s, s);
  ctx.translate(-region.x, -region.y);
  return { canvas, ctx, scale: s };
}

const local = (r: DOMRect, o: Origin): Box => ({ x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height });

const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function markColors(color: HighlightColor, dark: boolean): { bg: string; line: string } {
  const dot = HIGHLIGHT_COLORS[color]?.dot ?? HIGHLIGHT_COLORS.yellow.dot;
  const n = parseInt(dot.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  if (dark) return { bg: `rgba(${r},${g},${b},0.32)`, line: dot };
  const k = 0.78;
  return { bg: `rgba(${r},${g},${b},0.42)`, line: `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})` };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function paintInk(ctx: CanvasRenderingContext2D, ink: InkPaint[], dark: boolean) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of ink) {
    ctx.globalAlpha = p.tool === "marker" ? (dark ? 0.42 : 0.38) : 1;
    ctx.globalCompositeOperation = p.tool === "marker" && !dark ? "multiply" : "source-over";
    ctx.lineCap = p.tool === "marker" ? "butt" : "round";
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.width;
    try {
      ctx.stroke(new Path2D(p.d));
    } catch {
      /* camino inválido */
    }
  }
  ctx.restore();
}

function applyTransform(text: string, transform: string): string {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") return text.replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  return text;
}

export interface FlowRaster {
  root: HTMLElement;
  origin: Origin;
  region: Box;
  background: string;
  dark: boolean;
  scale: number;
  ink?: InkPaint[];
  /** Zona de la que se toma el texto (por defecto, la región). */
  textRegion?: Box;
}

/** Captura una región del texto adaptable (EPUB, Word, TXT…). */
export function rasterizeFlow(o: FlowRaster): { canvas: HTMLCanvasElement; text: string } {
  const { root, origin, region, dark } = o;
  const { canvas, ctx } = makeCanvas(region, o.scale);
  ctx.fillStyle = o.background;
  ctx.fillRect(region.x, region.y, region.w, region.h);
  const textRegion = o.textRegion ?? region;

  // 1. Fondos de los resaltados.
  const lines: (() => void)[] = [];
  for (const mark of Array.from(root.querySelectorAll<HTMLElement>("mark.mk"))) {
    const style = mark.dataset.s ?? "highlight";
    const colors = markColors((mark.dataset.c ?? "yellow") as HighlightColor, dark);
    const fs = parseFloat(getComputedStyle(mark).fontSize) || 16;
    for (const r of Array.from(mark.getClientRects())) {
      const b = local(r, origin);
      if (!hit(b, region)) continue;
      if (style === "highlight") {
        ctx.fillStyle = colors.bg;
        roundRect(ctx, b.x, b.y, b.w, b.h, fs * 0.18);
        ctx.fill();
      } else if (style !== "bold") {
        lines.push(() => {
          ctx.strokeStyle = colors.line;
          ctx.lineCap = "round";
          const baseline = b.y + b.h * 0.78;
          if (style === "underline") {
            ctx.lineWidth = fs * 0.11;
            ctx.beginPath();
            ctx.moveTo(b.x, baseline + fs * 0.2);
            ctx.lineTo(b.x + b.w, baseline + fs * 0.2);
            ctx.stroke();
          } else if (style === "strike") {
            ctx.lineWidth = fs * 0.09;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y + b.h * 0.56);
            ctx.lineTo(b.x + b.w, b.y + b.h * 0.56);
            ctx.stroke();
          } else if (style === "wavy") {
            ctx.lineWidth = fs * 0.07;
            const y = baseline + fs * 0.24;
            const wl = fs * 0.32;
            const amp = fs * 0.06;
            ctx.beginPath();
            ctx.moveTo(b.x, y);
            for (let x = b.x, i = 0; x < b.x + b.w; x += wl / 2, i++) {
              ctx.quadraticCurveTo(x + wl / 4, y + (i % 2 ? amp : -amp) * 2, Math.min(b.x + b.w, x + wl / 2), y);
            }
            ctx.stroke();
          } else if (style === "box") {
            const t = fs * 0.085;
            ctx.lineWidth = t;
            roundRect(ctx, b.x + t / 2, b.y + t / 2, b.w - t, b.h - t, fs * 0.3);
            ctx.stroke();
          }
        });
      }
    }
  }

  // 2. Imágenes y separadores.
  for (const img of Array.from(root.querySelectorAll("img"))) {
    const b = local(img.getBoundingClientRect(), origin);
    if (!hit(b, region) || !img.complete || !img.naturalWidth) continue;
    const ratio = img.naturalWidth / img.naturalHeight;
    let w = b.w;
    let h = w / ratio;
    if (h > b.h) {
      h = b.h;
      w = h * ratio;
    }
    try {
      ctx.drawImage(img, b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h);
    } catch {
      /* imagen no disponible */
    }
  }
  for (const hr of Array.from(root.querySelectorAll("hr"))) {
    const b = local(hr.getBoundingClientRect(), origin);
    if (!hit(b, region)) continue;
    ctx.fillStyle = getComputedStyle(hr).borderTopColor || "rgba(128,128,128,.4)";
    ctx.fillRect(b.x, b.y + b.h / 2, b.w, 1);
  }

  // 3. Texto, palabra por palabra, en su posición exacta.
  const words: string[] = [];
  const styles = new Map<Element, CSSStyleDeclaration>();
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  ctx.textBaseline = "alphabetic";
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement;
    if (!parent || !node.data.trim()) continue;
    let cs = styles.get(parent);
    if (!cs) {
      cs = getComputedStyle(parent);
      styles.set(parent, cs);
    }
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    range.selectNodeContents(node);
    const nodeBox = local(range.getBoundingClientRect(), origin);
    if (!hit(nodeBox, region) && !hit(nodeBox, textRegion)) continue;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.fillStyle = cs.color;
    const fs = parseFloat(cs.fontSize) || 16;
    const draw = (text: string, b: Box) => {
      const m = ctx.measureText(text);
      const asc = m.fontBoundingBoxAscent || fs * 0.8;
      const desc = m.fontBoundingBoxDescent || fs * 0.22;
      ctx.fillText(text, b.x, b.y + (b.h - (asc + desc)) / 2 + asc, b.w + 1);
    };
    const re = /\S+/g;
    for (let m = re.exec(node.data); m; m = re.exec(node.data)) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
      if (!rects.length) continue;
      const boxes = rects.map((r) => local(r, origin));
      if (boxes.some((b) => hit(b, textRegion))) words.push(m[0]);
      if (!boxes.some((b) => hit(b, region))) continue;
      const word = applyTransform(m[0], cs.textTransform);
      if (boxes.length === 1) {
        draw(word, boxes[0]);
        continue;
      }
      // Palabra partida entre renglones: letra por letra, con su guion.
      let prev: Box | null = null;
      for (let i = 0; i < m[0].length; i++) {
        range.setStart(node, m.index + i);
        range.setEnd(node, m.index + i + 1);
        const r = range.getClientRects()[0];
        if (!r) continue;
        const b = local(r, origin);
        if (prev && b.y > prev.y + prev.h * 0.5) draw("-", { x: prev.x + prev.w, y: prev.y, w: fs * 0.4, h: prev.h });
        draw(applyTransform(m[0][i], cs.textTransform), b);
        prev = b;
      }
    }
  }

  // 4. Líneas de los subrayados, por encima del texto, y los trazos a mano.
  for (const f of lines) f();
  if (o.ink?.length) paintInk(ctx, o.ink, dark);
  return { canvas, text: words.join(" ") };
}

export interface PdfRaster {
  pages: HTMLElement;
  origin: Origin;
  region: Box;
  background: string;
  scale: number;
  ink?: InkPaint[];
}

/** Captura una región de las páginas originales de un PDF. */
export function rasterizePdf(o: PdfRaster): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(o.region, o.scale);
  ctx.fillStyle = o.background;
  ctx.fillRect(o.region.x, o.region.y, o.region.w, o.region.h);
  for (const page of Array.from(o.pages.querySelectorAll<HTMLElement>(":scope > .pdf-page"))) {
    const b = local(page.getBoundingClientRect(), o.origin);
    if (!hit(b, o.region)) continue;
    ctx.fillStyle = "#fff";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    const c = page.querySelector("canvas");
    if (c && c.width) {
      try {
        ctx.drawImage(c, b.x, b.y, b.w, b.h);
      } catch {
        /* página no dibujada */
      }
    }
  }
  if (o.ink?.length) paintInk(ctx, o.ink, false);
  return canvas;
}

/** Lienzo → imagen liviana (WebP si el navegador puede; si no, PNG). */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else canvas.toBlob((p) => (p ? resolve(p) : reject(new Error("No se pudo crear la imagen."))), "image/png");
      },
      "image/webp",
      0.9
    );
  });
}
