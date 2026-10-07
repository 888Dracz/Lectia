// Contrato entre las vistas del lector (texto adaptable y PDF) y las
// herramientas de escritura a mano y recorte, más utilidades compartidas.
import { strokePath, type Box } from "../../notes/ink";
import type { InkPaint } from "../../notes/raster";
import type { InkAnchor, InkStroke } from "../../store/state";
import { offsetOf } from "./dom";

export interface Pt {
  x: number;
  y: number;
}

export interface AnchoredStroke {
  chapter: number;
  anchor: InkAnchor;
  /** Puntos en las unidades del ancla. */
  points: number[];
  /** Grosor en las unidades del ancla. */
  width: number;
}

export interface Capture {
  blob: Blob;
  text: string;
  width: number;
  height: number;
}

/**
 * Superficie de dibujo de una vista. Todas las coordenadas "locales" están en
 * píxeles CSS relativos al contenido (se mueven con la página).
 */
export interface InkSurface {
  view: "page" | "flow";
  toLocal(clientX: number, clientY: number): Pt;
  /** Grupo SVG donde se dibuja el trazo en curso (en coordenadas locales). */
  liveLayer(): SVGGElement | null;
  /** Píxeles que mide 1 "em" de grosor de tinta. */
  emPx(): number;
  /** Convierte un trazo recién hecho a su forma guardable (anclado). */
  anchor(points: number[], widthPx: number, center: Pt): AnchoredStroke | null;
  /** Página en la que cae un punto (para agrupar trazos por página). */
  pageKey(p: Pt): string;
  hitStroke(p: Pt, radius: number): { drawingId: string; strokeId: string } | null;
  /** Dibujos que se ven ahora. */
  drawingsInView(): string[];
  drawingBox(drawingId: string): Box | null;
  /** Zona de la página (columna de texto o página del PDF) que contiene el punto. */
  pageBox(p: Pt): Box;
  visibleBox(): Box;
  capture(region: Box, textRegion?: Box): Promise<Capture>;
  locate(region: Box): { chapter: number; offset?: number; fraction: number };
}

/** Solo colores hexadecimales (los trazos llegan también de respaldos). */
export function safeColor(c: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(c) ? c : "#e5484d";
}

export interface CachedStroke {
  drawingId: string;
  pts: number[];
  width: number;
  box: Box;
  tool: InkStroke["tool"];
  color: string;
  straight: boolean;
}

export function inkPathHtml(k: CachedStroke): string {
  return `<path class="ink-${k.tool === "marker" ? "marker" : "pen"}" d="${strokePath(k.pts, k.straight)}" stroke="${safeColor(k.color)}" stroke-width="${Math.round(k.width * 100) / 100}"/>`;
}

export function toPaint(k: CachedStroke): InkPaint {
  return { d: strokePath(k.pts, k.straight), color: safeColor(k.color), width: k.width, tool: k.tool };
}

/** Desplazamiento de texto bajo un punto de la pantalla. */
export function caretOffsetAt(root: HTMLElement, x: number, y: number): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let off = 0;
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    node = p?.offsetNode ?? null;
    off = p?.offset ?? 0;
  } else if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y);
    node = r?.startContainer ?? null;
    off = r?.startOffset ?? 0;
  }
  if (!node || !root.contains(node)) return null;
  return offsetOf(root, node, off);
}

/** Acerca un desplazamiento al carácter visible más próximo (no espacio). */
export function nearestVisibleChar(text: string, offset: number): number {
  const o = Math.max(0, Math.min(text.length - 1, offset));
  if (!/\s/.test(text[o] ?? " ")) return o;
  for (let d = 1; d < 40; d++) {
    if (o + d < text.length && !/\s/.test(text[o + d])) return o + d;
    if (o - d >= 0 && !/\s/.test(text[o - d])) return o - d;
  }
  return o;
}

export function captureScale(): number {
  return Math.min(3, (window.devicePixelRatio || 1) * 1.25);
}
