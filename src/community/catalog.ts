// Opciones para armar el perfil: géneros, avatares, colores y momentos de lectura.
import type { ProfileColor, ReadingMoment } from "./types";

export const GENRES: { id: string; emoji: string }[] = [
  { id: "Novela", emoji: "📖" },
  { id: "Fantasía", emoji: "🐉" },
  { id: "Ciencia ficción", emoji: "🚀" },
  { id: "Misterio", emoji: "🔎" },
  { id: "Thriller", emoji: "🗡️" },
  { id: "Terror", emoji: "👻" },
  { id: "Romance", emoji: "💌" },
  { id: "Histórica", emoji: "🏰" },
  { id: "Aventura", emoji: "🧭" },
  { id: "Clásicos", emoji: "🏛️" },
  { id: "Distopía", emoji: "🌆" },
  { id: "Realismo mágico", emoji: "🦋" },
  { id: "Poesía", emoji: "🪶" },
  { id: "Teatro", emoji: "🎭" },
  { id: "Cómic y manga", emoji: "💥" },
  { id: "Juvenil", emoji: "🎒" },
  { id: "Infantil", emoji: "🧸" },
  { id: "Biografías", emoji: "👤" },
  { id: "Ensayo", emoji: "🖋️" },
  { id: "Filosofía", emoji: "🦉" },
  { id: "Historia", emoji: "📜" },
  { id: "Ciencia", emoji: "🔬" },
  { id: "Psicología", emoji: "🧠" },
  { id: "Desarrollo personal", emoji: "🌱" },
  { id: "Negocios", emoji: "📈" },
  { id: "Arte", emoji: "🎨" },
  { id: "Viajes", emoji: "✈️" },
  { id: "Cocina", emoji: "🍲" },
  { id: "Espiritualidad", emoji: "🕯️" },
  { id: "Humor", emoji: "😂" },
];

export const MAX_GENRES = 8;

export const genreEmoji = (g: string) => GENRES.find((x) => x.id === g)?.emoji ?? "📚";

export const AVATARS = [
  "📚", "🦉", "🦊", "🐱", "🐼", "🐸", "🦄", "🐙", "🐝", "🐢", "🐧", "🦁",
  "🐨", "🐰", "🐉", "🦋", "🧚", "🧙", "🌙", "⭐", "🌸", "🍀", "🍄", "🔥",
  "☕", "🎧", "🪐", "🌊", "🌵", "🍩", "🎈", "👑",
];

export const COLORS: { id: ProfileColor; value: string; name: string }[] = [
  { id: "gold", value: "#f2b544", name: "Oro" },
  { id: "orange", value: "#ff9f43", name: "Naranja" },
  { id: "red", value: "#ff6b6b", name: "Coral" },
  { id: "rose", value: "#ff7aa2", name: "Rosa" },
  { id: "violet", value: "#9b8cff", name: "Violeta" },
  { id: "blue", value: "#6aa8ff", name: "Azul" },
  { id: "teal", value: "#45d0c1", name: "Turquesa" },
  { id: "green", value: "#4fd68a", name: "Verde" },
];

export const colorValue = (c: string) => COLORS.find((x) => x.id === c)?.value ?? COLORS[0].value;

export const MOMENTS: { id: ReadingMoment; label: string; emoji: string }[] = [
  { id: "manana", label: "Por la mañana", emoji: "🌅" },
  { id: "tarde", label: "Por la tarde", emoji: "☀️" },
  { id: "noche", label: "Por la noche", emoji: "🌙" },
  { id: "madrugada", label: "De madrugada", emoji: "🦉" },
];

export const momentLabel = (m: string) => MOMENTS.find((x) => x.id === m);

/** Propone un nombre de usuario válido a partir del nombre. */
export function suggestUsername(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 16);
  return base.length >= 3 ? base : `${base || "lector"}${Math.floor(100 + Math.random() * 900)}`;
}

export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
