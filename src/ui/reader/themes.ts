import type { CustomTheme, FontId, ReaderThemeId } from "../../store/state";

export interface ReaderTheme {
  id: ReaderThemeId;
  name: string;
  bg: string;
  fg: string;
  muted: string;
  link: string;
  dark: boolean;
  /** Filtro CSS para las páginas de PDF en este tema. */
  pdfFilter: string;
  chrome: string;
}

export const READER_THEMES: ReaderTheme[] = [
  { id: "day", name: "Día", bg: "#ffffff", fg: "#1b1b1f", muted: "#8a8a94", link: "#2f6fd6", dark: false, pdfFilter: "none", chrome: "#ffffff" },
  { id: "paper", name: "Papel", bg: "#f7f1e5", fg: "#2f2a22", muted: "#9b9182", link: "#9a5b12", dark: false, pdfFilter: "sepia(0.12)", chrome: "#f7f1e5" },
  { id: "sepia", name: "Sepia", bg: "#ead9bb", fg: "#4a3826", muted: "#9a8466", link: "#8a4b12", dark: false, pdfFilter: "sepia(0.45) contrast(0.95)", chrome: "#ead9bb" },
  { id: "mint", name: "Menta", bg: "#dcebdd", fg: "#203327", muted: "#7f9a86", link: "#25764a", dark: false, pdfFilter: "sepia(0.2) hue-rotate(60deg) saturate(0.7)", chrome: "#dcebdd" },
  { id: "dusk", name: "Atardecer", bg: "#3b3340", fg: "#e6dccf", muted: "#9d8f97", link: "#f3b37a", dark: true, pdfFilter: "invert(0.86) hue-rotate(180deg) sepia(0.3)", chrome: "#3b3340" },
  { id: "night", name: "Noche", bg: "#16181f", fg: "#c9c4b8", muted: "#6f6c76", link: "#e7b866", dark: true, pdfFilter: "invert(0.88) hue-rotate(180deg)", chrome: "#16181f" },
  { id: "amoled", name: "AMOLED", bg: "#000000", fg: "#a8a8a8", muted: "#5a5a5a", link: "#d9a441", dark: true, pdfFilter: "invert(0.92) hue-rotate(180deg) contrast(1.1)", chrome: "#000000" },
  { id: "moon", name: "Luna", bg: "#0b1220", fg: "#9fc3c6", muted: "#4f6670", link: "#7fd4c8", dark: true, pdfFilter: "invert(0.9) hue-rotate(160deg) sepia(0.2)", chrome: "#0b1220" },
];

const mix = (a: string, b: string, t: number) => `color-mix(in srgb, ${a} ${Math.round((1 - t) * 100)}%, ${b})`;

/** Tema creado por el usuario a partir de sus colores. */
export function customReaderTheme(c: CustomTheme): ReaderTheme {
  return {
    id: "custom",
    name: "Personal",
    bg: c.bg,
    fg: c.fg,
    muted: mix(c.fg, c.bg, 0.5),
    link: c.link,
    dark: c.dark,
    pdfFilter: c.dark ? "invert(0.88) hue-rotate(180deg)" : "none",
    chrome: c.bg,
  };
}

export function readerTheme(id: ReaderThemeId, custom?: CustomTheme): ReaderTheme {
  if (id === "custom" && custom) return customReaderTheme(custom);
  return READER_THEMES.find((t) => t.id === id) ?? READER_THEMES[1];
}

/** Color aproximado de una temperatura de color (kelvin), para el filtro de luz azul. */
export function kelvinToRgb(k: number): string {
  const t = Math.min(6600, Math.max(1000, k)) / 100;
  const r = 255;
  const g = Math.min(255, Math.max(0, 99.47 * Math.log(t) - 161.12));
  const b = t <= 19 ? 0 : Math.min(255, Math.max(0, 138.52 * Math.log(t - 10) - 305.04));
  return `rgb(${r}, ${Math.round(g)}, ${Math.round(b)})`;
}

export interface ReaderFont {
  id: FontId;
  name: string;
  css: string;
}

export const READER_FONTS: ReaderFont[] = [
  { id: "literata", name: "Literata", css: '"Literata Variable", "Literata", Georgia, serif' },
  { id: "lora", name: "Lora", css: '"Lora Variable", "Lora", Georgia, serif' },
  { id: "merriweather", name: "Merriweather", css: '"Merriweather", Georgia, serif' },
  { id: "atkinson", name: "Atkinson", css: '"Atkinson Hyperlegible", Verdana, sans-serif' },
  { id: "inter", name: "Inter", css: '"Inter Variable", "Inter", system-ui, sans-serif' },
  { id: "serif", name: "Serif del sistema", css: 'Georgia, "Times New Roman", "Noto Serif", serif' },
  { id: "sans", name: "Sans del sistema", css: 'system-ui, -apple-system, Roboto, "Segoe UI", sans-serif' },
];

export function readerFont(id: FontId): ReaderFont {
  return READER_FONTS.find((f) => f.id === id) ?? READER_FONTS[0];
}

export const HIGHLIGHT_COLORS = {
  yellow: { light: "rgba(255, 214, 10, 0.42)", dark: "rgba(255, 200, 40, 0.32)", label: "Amarillo", dot: "#f5c518" },
  green: { light: "rgba(80, 200, 120, 0.36)", dark: "rgba(80, 210, 130, 0.28)", label: "Verde", dot: "#4fc97a" },
  blue: { light: "rgba(90, 160, 255, 0.34)", dark: "rgba(100, 160, 255, 0.3)", label: "Azul", dot: "#5aa0ff" },
  pink: { light: "rgba(255, 110, 170, 0.32)", dark: "rgba(255, 120, 170, 0.3)", label: "Rosa", dot: "#ff6eaa" },
} as const;
