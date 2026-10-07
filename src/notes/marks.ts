// Formas de remarcar texto y colores (subrayados, trazos y notas).
import type { HighlightColor, MarkStyle, NoteTint, NotebookCover } from "../store/state";

export interface MarkStyleInfo {
  id: MarkStyle;
  /** Verbo para el botón ("Subrayar"). */
  action: string;
  /** Título de la sección del cuaderno ("Subrayados"). */
  section: string;
  /** Un solo elemento ("subrayado"). */
  noun: string;
}

export const MARK_STYLES: MarkStyleInfo[] = [
  { id: "highlight", action: "Resaltar", section: "Resaltados", noun: "resaltado" },
  { id: "underline", action: "Subrayar", section: "Subrayados", noun: "subrayado" },
  { id: "wavy", action: "Ondular", section: "Ondulados", noun: "ondulado" },
  { id: "bold", action: "Negrita", section: "En negrita", noun: "en negrita" },
  { id: "box", action: "Recuadrar", section: "Recuadrados", noun: "recuadro" },
  { id: "strike", action: "Tachar", section: "Tachados", noun: "tachado" },
];

export function markStyleInfo(style: MarkStyle | undefined): MarkStyleInfo {
  return MARK_STYLES.find((m) => m.id === style) ?? MARK_STYLES[0];
}

export const HIGHLIGHT_COLORS: Record<HighlightColor, { light: string; dark: string; label: string; dot: string }> = {
  yellow: { light: "rgba(255, 214, 10, 0.42)", dark: "rgba(255, 200, 40, 0.3)", label: "Amarillo", dot: "#f5c518" },
  green: { light: "rgba(80, 200, 120, 0.36)", dark: "rgba(80, 210, 130, 0.27)", label: "Verde", dot: "#4fc97a" },
  blue: { light: "rgba(90, 160, 255, 0.34)", dark: "rgba(100, 160, 255, 0.3)", label: "Azul", dot: "#5aa0ff" },
  pink: { light: "rgba(255, 110, 170, 0.32)", dark: "rgba(255, 120, 170, 0.28)", label: "Rosa", dot: "#ff6eaa" },
  orange: { light: "rgba(255, 150, 60, 0.36)", dark: "rgba(255, 160, 80, 0.3)", label: "Naranja", dot: "#ff9440" },
  violet: { light: "rgba(150, 120, 255, 0.32)", dark: "rgba(165, 140, 255, 0.3)", label: "Violeta", dot: "#9d82ff" },
};

export const HIGHLIGHT_COLOR_IDS = Object.keys(HIGHLIGHT_COLORS) as HighlightColor[];

/** Tintas para escribir a mano. */
export const INK_COLORS: { id: string; label: string }[] = [
  { id: "#e5484d", label: "Rojo" },
  { id: "#f76b15", label: "Naranja" },
  { id: "#ffc53d", label: "Dorado" },
  { id: "#30a46c", label: "Verde" },
  { id: "#0090ff", label: "Azul" },
  { id: "#8e4ec6", label: "Violeta" },
  { id: "#d6409f", label: "Fucsia" },
  { id: "#1c1c1f", label: "Tinta" },
];

/** Grosores de la pluma (en em) por tamaño 1–3; el marcador es más ancho. */
export function inkWidthEm(tool: "pen" | "marker", size: number): number {
  const pen = [0.07, 0.11, 0.17][Math.max(0, Math.min(2, size - 1))];
  return tool === "marker" ? pen * 6.5 : pen;
}

export const NOTE_TINTS: Record<NoteTint, { bg: string; ink: string; label: string }> = {
  lemon: { bg: "#fff3b0", ink: "#4a3b00", label: "Limón" },
  peach: { bg: "#ffd9c7", ink: "#55240f", label: "Durazno" },
  mint: { bg: "#cdf2dc", ink: "#103d26", label: "Menta" },
  sky: { bg: "#d3e8ff", ink: "#0f2f55", label: "Cielo" },
  lilac: { bg: "#e7dcff", ink: "#2f1a5c", label: "Lila" },
};

export const NOTEBOOK_COVERS: Record<NotebookCover, { a: string; b: string; ink: string; label: string }> = {
  terracota: { a: "#c0583a", b: "#8e3a25", ink: "#fff3e8", label: "Terracota" },
  bosque: { a: "#3f7a55", b: "#24503a", ink: "#ecf7ee", label: "Bosque" },
  noche: { a: "#2e3a6e", b: "#1a2147", ink: "#e9ecff", label: "Noche" },
  ciruela: { a: "#7a3a6b", b: "#4f2147", ink: "#fbeaf5", label: "Ciruela" },
  mostaza: { a: "#d39b2a", b: "#a06d12", ink: "#2b1d05", label: "Mostaza" },
  oceano: { a: "#2a8a99", b: "#185e6a", ink: "#e8fbfd", label: "Océano" },
  rosa: { a: "#e58aa6", b: "#bf5f7f", ink: "#3d0f1f", label: "Rosa" },
  grafito: { a: "#4a4b52", b: "#2b2c31", ink: "#f2f2f5", label: "Grafito" },
};

export const NOTEBOOK_COVER_IDS = Object.keys(NOTEBOOK_COVERS) as NotebookCover[];

export const NOTEBOOK_STICKERS = ["📓", "🌙", "🌿", "✨", "🦋", "🌸", "☕", "🪶", "🔖", "🗝️", "🍂", "⭐", "🐚", "🍄", "🌊", "🔥"];
