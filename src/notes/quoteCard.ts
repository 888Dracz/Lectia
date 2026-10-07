// Tarjetas de cita: una imagen bonita con un fragmento subrayado, lista para
// compartir (cuadrada o en formato historia).
import type { HighlightColor, MarkStyle } from "../store/state";
import { HIGHLIGHT_COLORS } from "./marks";

export type CardTheme = "papel" | "noche" | "acuarela" | "bosque" | "minimo";
export type CardFormat = "square" | "story";

export const CARD_THEMES: { id: CardTheme; label: string; swatch: string }[] = [
  { id: "papel", label: "Papel", swatch: "linear-gradient(135deg,#f8f1e3,#ead9bb)" },
  { id: "noche", label: "Noche", swatch: "linear-gradient(135deg,#283063,#0d0f15)" },
  { id: "acuarela", label: "Acuarela", swatch: "linear-gradient(135deg,#ffd6e3,#e3dcff,#ffe9cf)" },
  { id: "bosque", label: "Bosque", swatch: "linear-gradient(135deg,#3f7a55,#1d3d2c)" },
  { id: "minimo", label: "Mínimo", swatch: "linear-gradient(135deg,#ffffff,#eeeeee)" },
];

interface Palette {
  ink: string;
  soft: string;
  accent: string;
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES: Record<CardTheme, Palette> = {
  papel: {
    ink: "#2f2a22",
    soft: "#8a7a62",
    accent: "#b86a2a",
    paint: (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#fbf5ea");
      g.addColorStop(1, "#efe1c6");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const rnd = seeded(7);
      ctx.fillStyle = "rgba(120, 90, 50, 0.05)";
      for (let i = 0; i < 2600; i++) ctx.fillRect(rnd() * w, rnd() * h, 1.6, 1.6);
      ctx.strokeStyle = "rgba(184, 106, 42, 0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 40, w - 80, h - 80);
    },
  },
  noche: {
    ink: "#f3ecdc",
    soft: "#a9a3c2",
    accent: "#f2b544",
    paint: (ctx, w, h) => {
      const g = ctx.createRadialGradient(w * 0.3, h * 0.15, 40, w * 0.5, h * 0.5, Math.max(w, h));
      g.addColorStop(0, "#2d3570");
      g.addColorStop(1, "#0b0d16");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const rnd = seeded(11);
      for (let i = 0; i < 140; i++) {
        ctx.globalAlpha = 0.25 + rnd() * 0.6;
        ctx.fillStyle = rnd() < 0.15 ? "#ffd98a" : "#ffffff";
        const r = rnd() * 1.8 + 0.4;
        ctx.beginPath();
        ctx.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
  acuarela: {
    ink: "#3a2b3f",
    soft: "#7d6a84",
    accent: "#c4577f",
    paint: (ctx, w, h) => {
      ctx.fillStyle = "#fff8f1";
      ctx.fillRect(0, 0, w, h);
      const blobs: [number, number, number, string][] = [
        [0.15, 0.12, 0.55, "rgba(255, 170, 200, 0.55)"],
        [0.9, 0.25, 0.5, "rgba(190, 175, 255, 0.5)"],
        [0.25, 0.9, 0.6, "rgba(255, 210, 160, 0.55)"],
        [0.85, 0.85, 0.45, "rgba(160, 225, 210, 0.45)"],
      ];
      for (const [x, y, r, c] of blobs) {
        const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * Math.max(w, h));
        g.addColorStop(0, c);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    },
  },
  bosque: {
    ink: "#f3f0e2",
    soft: "#b9d3bd",
    accent: "#cfe8b4",
    paint: (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#3f7a55");
      g.addColorStop(1, "#163223");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.ellipse(w * 0.92, h * 0.08, 60 + i * 55, 60 + i * 55, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
  },
  minimo: {
    ink: "#141414",
    soft: "#777",
    accent: "#141414",
    paint: (ctx, w, h) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    },
  },
};

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\n+/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
  }
  return lines;
}

export interface CardOptions {
  text: string;
  title: string;
  author: string;
  theme: CardTheme;
  format: CardFormat;
  style?: MarkStyle;
  color?: HighlightColor;
}

const QUOTE_FONT = '"Literata Variable", "Literata", Georgia, serif';
const UI_FONT = '"Inter Variable", "Inter", system-ui, sans-serif';
const HAND_FONT = '"Caveat Variable", "Caveat", cursive';

/** Espera a que estén las fuentes de la tarjeta (si no, el lienzo usa otras). */
export async function loadCardFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`italic 400 60px ${QUOTE_FONT}`),
      document.fonts.load(`400 60px ${QUOTE_FONT}`),
      document.fonts.load(`600 30px ${UI_FONT}`),
      document.fonts.load(`600 40px ${HAND_FONT}`),
    ]);
  } catch {
    /* se usan las fuentes de respaldo */
  }
}

export function drawQuoteCard(canvas: HTMLCanvasElement, o: CardOptions): void {
  const W = 1080;
  const H = o.format === "story" ? 1920 : 1080;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const pal = PALETTES[o.theme];
  pal.paint(ctx, W, H);

  const pad = 120;
  const maxW = W - pad * 2;
  const text = o.text.replace(/\s+/g, " ").trim();
  const quoted = `${text}`;

  // Tamaño de letra que entra en el espacio disponible.
  const room = H - (o.format === "story" ? 760 : 470);
  let size = o.format === "story" ? 74 : 64;
  let lines: string[] = [];
  for (; size >= 26; size -= 2) {
    ctx.font = `italic 400 ${size}px ${QUOTE_FONT}`;
    lines = wrap(ctx, quoted, maxW);
    if (lines.length * size * 1.42 <= room) break;
  }
  if (lines.length * size * 1.42 > room) {
    // Muy largo: se corta con puntos suspensivos.
    const max = Math.max(1, Math.floor(room / (size * 1.42)));
    lines = lines.slice(0, max);
    lines[max - 1] = `${lines[max - 1].replace(/[\s,.;:]+\S*$/, "")}…`;
  }
  const lh = size * 1.42;
  const blockH = lines.length * lh;
  let y = (H - blockH) / 2 + size * 0.2 - (o.format === "story" ? 40 : 20);

  // Comilla decorativa.
  ctx.fillStyle = pal.accent;
  ctx.globalAlpha = 0.85;
  ctx.font = `700 ${size * 3}px ${QUOTE_FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("“", pad - 14, y - size * 0.25);
  ctx.globalAlpha = 1;

  // Remarcado, según cómo se hizo en el libro.
  const dot = o.color ? HIGHLIGHT_COLORS[o.color].dot : pal.accent;
  ctx.font = `italic 400 ${size}px ${QUOTE_FONT}`;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (o.style === "highlight") {
      ctx.fillStyle = dot;
      ctx.globalAlpha = o.theme === "noche" || o.theme === "bosque" ? 0.32 : 0.38;
      ctx.fillRect(pad - 8, y + size * 0.5, w + 16, size * 0.55);
      ctx.globalAlpha = 1;
    } else if (o.style === "underline" || o.style === "wavy") {
      ctx.strokeStyle = dot;
      ctx.lineWidth = size * 0.07;
      ctx.beginPath();
      const uy = y + size * 1.12;
      if (o.style === "underline") {
        ctx.moveTo(pad, uy);
        ctx.lineTo(pad + w, uy);
      } else {
        ctx.moveTo(pad, uy);
        for (let x = pad, i = 0; x < pad + w; x += size * 0.18, i++) ctx.quadraticCurveTo(x + size * 0.09, uy + (i % 2 ? 1 : -1) * size * 0.09, x + size * 0.18, uy);
      }
      ctx.stroke();
    }
    ctx.fillStyle = pal.ink;
    ctx.textBaseline = "top";
    ctx.fillText(line, pad, y);
    y += lh;
  }

  // Atribución.
  y += size * 0.7;
  ctx.fillStyle = pal.accent;
  ctx.fillRect(pad, y, 64, 4);
  y += 34;
  ctx.fillStyle = pal.ink;
  ctx.font = `650 34px ${UI_FONT}`;
  const title = o.title.length > 48 ? `${o.title.slice(0, 46)}…` : o.title;
  ctx.fillText(title, pad, y);
  if (o.author) {
    ctx.fillStyle = pal.soft;
    ctx.font = `500 30px ${UI_FONT}`;
    ctx.fillText(o.author, pad, y + 48);
  }

  // Firma.
  ctx.fillStyle = pal.soft;
  ctx.globalAlpha = 0.8;
  ctx.font = `600 40px ${HAND_FONT}`;
  ctx.textBaseline = "alphabetic";
  const sig = "subrayado en Lectia ✦";
  ctx.fillText(sig, W - pad - ctx.measureText(sig).width, H - 70);
  ctx.globalAlpha = 1;
}
