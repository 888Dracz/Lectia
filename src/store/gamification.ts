// Lógica pura de la gamificación: niveles, rangos, rachas, logros y retos.
import { addDays, dayKey, parseDayKey } from "../lib/util";
import type { BookMeta } from "../books/types";
import { defaultNotebookName } from "../notes/notebook";
import type { DayStats, PersistedState } from "./state";

export const RANKS = [
  { from: 1, name: "Chispa", emoji: "✨" },
  { from: 3, name: "Destello", emoji: "💫" },
  { from: 6, name: "Luciérnaga", emoji: "🪲" },
  { from: 10, name: "Farol", emoji: "🏮" },
  { from: 15, name: "Polvo de estrellas", emoji: "🌟" },
  { from: 21, name: "Constelación", emoji: "🌌" },
  { from: 28, name: "Cometa", emoji: "☄️" },
  { from: 36, name: "Supernova", emoji: "💥" },
  { from: 45, name: "Galaxia lectora", emoji: "🪐" },
  { from: 60, name: "Leyenda de la biblioteca", emoji: "📜" },
];

/** XP acumulada necesaria para alcanzar un nivel (nivel 1 = 0 XP). */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  progress: number;
  rank: (typeof RANKS)[number];
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const rank = [...RANKS].reverse().find((r) => level >= r.from) ?? RANKS[0];
  return {
    level,
    xpIntoLevel: xp - start,
    xpForNext: next - start,
    progress: (xp - start) / (next - start),
    rank,
  };
}

/** Un día cuenta para la racha si se leyó al menos un minuto o se entrenó. */
export function dayCounts(d: DayStats | undefined): boolean {
  return !!d && (d.ms >= 60000 || d.games > 0 || d.rsvpWords >= 100);
}

export function computeStreak(days: Record<string, DayStats>, today = new Date()): { current: number; best: number; todayDone: boolean } {
  const todayDone = dayCounts(days[dayKey(today)]);
  let current = 0;
  let cursor = todayDone ? today : addDays(today, -1);
  while (dayCounts(days[dayKey(cursor)])) {
    current++;
    cursor = addDays(cursor, -1);
  }
  // Mejor racha histórica
  const keys = Object.keys(days).filter((k) => dayCounts(days[k])).sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of keys) {
    const d = parseDayKey(k);
    run = prev && dayKey(addDays(prev, 1)) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best: Math.max(best, current), todayDone };
}

export interface Quest {
  id: string;
  title: string;
  icon: string;
  progress: number;
  target: number;
  xp: number;
  unit: string;
}

export function dailyQuests(day: DayStats | undefined, goalMin: number): Quest[] {
  const d = day ?? { ms: 0, pages: 0, words: 0, games: 0, rsvpWords: 0, xp: 0, quests: [] };
  return [
    { id: "read", title: `Lee ${goalMin} minutos`, icon: "📖", progress: Math.floor(d.ms / 60000), target: goalMin, xp: 25, unit: "min" },
    { id: "games", title: "Juega 2 minijuegos", icon: "🎮", progress: d.games, target: 2, xp: 20, unit: "" },
    { id: "rsvp", title: "Lee 300 palabras en lectura rápida", icon: "⚡", progress: d.rsvpWords, target: 300, xp: 20, unit: "pal." },
  ];
}

export interface AchievementCtx {
  state: PersistedState;
  streak: number;
  books: BookMeta[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
  check: (c: AchievementCtx) => boolean;
}

const totalMs = (c: AchievementCtx) => c.books.reduce((a, b) => a + (b.readingMs || 0), 0);
const gamesPlayed = (c: AchievementCtx) => Object.values(c.state.progress.games).reduce((a, g) => a + (g?.plays ?? 0), 0);

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-book", title: "Primera semilla", description: "Agrega tu primer libro", icon: "🌱", xp: 10, check: (c) => c.books.length >= 1 },
  { id: "first-session", title: "Primeras páginas", description: "Lee durante 5 minutos", icon: "📖", xp: 15, check: (c) => totalMs(c) >= 5 * 60000 },
  { id: "hour", title: "Una hora mágica", description: "Acumula 1 hora de lectura", icon: "⏳", xp: 30, check: (c) => totalMs(c) >= 3600000 },
  { id: "ten-hours", title: "Maratonista", description: "Acumula 10 horas de lectura", icon: "🏃", xp: 100, check: (c) => totalMs(c) >= 10 * 3600000 },
  { id: "fifty-hours", title: "Ratón de biblioteca", description: "Acumula 50 horas de lectura", icon: "🐭", xp: 250, check: (c) => totalMs(c) >= 50 * 3600000 },
  { id: "finish-1", title: "¡Fin!", description: "Termina un libro", icon: "🏁", xp: 60, check: (c) => c.state.progress.booksFinished >= 1 },
  { id: "finish-5", title: "Devoralibros", description: "Termina 5 libros", icon: "📚", xp: 150, check: (c) => c.state.progress.booksFinished >= 5 },
  { id: "finish-20", title: "Gran lectora, gran lector", description: "Termina 20 libros", icon: "🏛️", xp: 400, check: (c) => c.state.progress.booksFinished >= 20 },
  { id: "streak-3", title: "Constancia", description: "Racha de 3 días", icon: "🔥", xp: 20, check: (c) => c.streak >= 3 },
  { id: "streak-7", title: "Semana encendida", description: "Racha de 7 días", icon: "🔥", xp: 50, check: (c) => c.streak >= 7 },
  { id: "streak-30", title: "Hábito de hierro", description: "Racha de 30 días", icon: "🏆", xp: 200, check: (c) => c.streak >= 30 },
  { id: "collector", title: "Coleccionista", description: "Ten 20 libros en tu biblioteca", icon: "🗃️", xp: 50, check: (c) => c.books.length >= 20 },
  { id: "librarian", title: "Bibliotecaria/o", description: "Crea 3 estanterías", icon: "🗂️", xp: 25, check: (c) => c.state.collections.length >= 3 },
  { id: "highlighter", title: "Subrayador", description: "Haz 10 subrayados", icon: "🖍️", xp: 30, check: (c) => c.state.highlights.length >= 10 },
  { id: "bookmarker", title: "Marcapáginas", description: "Guarda 5 marcadores", icon: "🔖", xp: 15, check: (c) => c.state.bookmarks.length >= 5 },
  { id: "speed-300", title: "Ojos rápidos", description: "Lee a 300 palabras por minuto en modo rápido", icon: "⚡", xp: 30, check: (c) => c.state.progress.bestRsvpWpm >= 300 },
  { id: "speed-500", title: "Rayo lector", description: "Lee a 500 palabras por minuto en modo rápido", icon: "🌩️", xp: 80, check: (c) => c.state.progress.bestRsvpWpm >= 500 },
  { id: "rsvp-10k", title: "Diez mil destellos", description: "Lee 10.000 palabras en modo rápido", icon: "💫", xp: 100, check: (c) => c.state.progress.totalRsvpWords >= 10000 },
  { id: "gamer", title: "Juguetona mente", description: "Juega 10 minijuegos", icon: "🎮", xp: 30, check: (c) => gamesPlayed(c) >= 10 },
  { id: "all-games", title: "Explorador", description: "Prueba todos los minijuegos", icon: "🧭", xp: 40, check: (c) => (["speedtest", "cloze", "scramble", "flash", "schulte"] as const).every((g) => (c.state.progress.games[g]?.plays ?? 0) > 0) },
  { id: "schulte-fast", title: "Visión de halcón", description: "Completa la tabla 5×5 en menos de 25 s", icon: "🦅", xp: 50, check: (c) => (c.state.progress.games.schulte?.best ?? 0) >= 1000 - 25 * 10 },
  { id: "night-owl", title: "Búho nocturno", description: "Lee después de medianoche", icon: "🦉", xp: 15, check: () => false },
  { id: "early-bird", title: "Madrugador", description: "Lee antes de las 7 de la mañana", icon: "🐦", xp: 15, check: () => false },
  { id: "first-ink", title: "Trazo libre", description: "Escribe o dibuja a mano sobre una página", icon: "✍️", xp: 15, check: (c) => c.state.drawings.length >= 1 },
  { id: "clipper", title: "Tijeras de oro", description: "Guarda 5 recortes en tus cuadernos", icon: "✂️", xp: 25, check: (c) => c.state.clips.length >= 5 },
  { id: "named-notebook", title: "Con nombre propio", description: "Ponle nombre a uno de tus cuadernos", icon: "📓", xp: 15, check: (c) => Object.values(c.state.notebooks).some((n) => n.name.trim() !== defaultNotebookName(n.bookTitle)) },
  { id: "reading-list", title: "Lo que viene", description: "Arma una lista por leer con 5 libros", icon: "🗒️", xp: 20, check: (c) => c.state.readingList.length >= 5 },
  { id: "list-done", title: "¡Tachado!", description: "Termina un libro de tu lista por leer", icon: "✅", xp: 30, check: (c) => c.state.readingList.some((i) => !!i.doneAt) },
  { id: "backup", title: "A salvo", description: "Haz tu primer respaldo", icon: "🛟", xp: 20, check: (c) => !!c.state.app.lastBackupAt },
];

/** Logros que se cumplen ahora y aún no estaban desbloqueados. */
export function newlyUnlocked(ctx: AchievementCtx): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !ctx.state.progress.achievements[a.id] && a.check(ctx));
}

/** XP por minutos de lectura. */
export const XP_PER_MINUTE = 2;
