// Estado persistente de la app: biblioteca, notas, ajustes y progreso.
import type { BookMeta } from "../books/types";
import type { PostData, PostKind } from "../community/types";

/** Máximo de protectores de racha guardados a la vez. */
export const MAX_FREEZES = 2;

export const STATE_VERSION = 1;

export interface Collection {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  chapter: number;
  fraction: number;
  percent: number;
  label: string;
  createdAt: number;
}

export type HighlightColor = "yellow" | "green" | "blue" | "pink";

export interface Highlight {
  id: string;
  bookId: string;
  chapter: number;
  /** Desplazamientos en el texto plano del capítulo. */
  start: number;
  end: number;
  text: string;
  color: HighlightColor;
  note: string;
  createdAt: number;
}

export type ReaderThemeId = "day" | "paper" | "sepia" | "mint" | "dusk" | "night" | "amoled" | "moon";
export type FontId = "literata" | "lora" | "merriweather" | "atkinson" | "inter" | "serif" | "sans";

export interface ReaderSettings {
  theme: ReaderThemeId;
  font: FontId;
  fontSize: number;
  lineHeight: number;
  margin: number;
  align: "justify" | "left";
  paragraphSpacing: number;
  indent: boolean;
  hyphenate: boolean;
  mode: "paged" | "scroll";
  animation: "slide" | "none";
  brightness: number;
  tapZones: boolean;
  showStatus: boolean;
  keepAwake: boolean;
  fullscreen: boolean;
  ttsRate: number;
  ttsVoice: string;
  rsvpWpm: number;
  rsvpChunk: number;
  pdfZoom: number;
}

export type LibraryView = "grid" | "list" | "shelf";
export type LibrarySort = "recent" | "added" | "title" | "author" | "progress";

export interface AppSettings {
  theme: "system" | "light" | "dark";
  accent: "gold" | "violet" | "rose" | "teal";
  dailyGoalMin: number;
  libraryView: LibraryView;
  librarySort: LibrarySort;
  trainingSource: string;
  lastBackupAt?: number;
  sampleOffered: boolean;
  backupNagDismissedAt?: number;
}

export interface DayStats {
  ms: number;
  pages: number;
  words: number;
  games: number;
  rsvpWords: number;
  xp: number;
  quests: string[];
}

export type GameId = "rsvp" | "speedtest" | "cloze" | "scramble" | "flash" | "schulte";

export interface GameRecord {
  plays: number;
  best: number;
  lastAt: number;
}

export interface WpmSample {
  at: number;
  wpm: number;
  comprehension: number;
}

export interface Progress {
  xp: number;
  achievements: Record<string, number>;
  days: Record<string, DayStats>;
  games: Partial<Record<GameId, GameRecord>>;
  wpmHistory: WpmSample[];
  totalPages: number;
  totalRsvpWords: number;
  bestRsvpWpm: number;
  booksFinished: number;
  /** Protectores de racha disponibles. */
  freezes: number;
  /** Días que salvó un protector (no suman a la racha, pero no la cortan). */
  frozenDays: string[];
  /** Último día en que se ganó un protector (para no darlo dos veces). */
  freezeAwardDay?: string;
}

/** Preferencias de la comunidad y novedades pendientes de publicar. */
export interface CommunitySettings {
  /** Publicar en Novedades los libros que termino. */
  autoShareBooks: boolean;
  /** Publicar logros, rachas, niveles y ascensos de liga. */
  autoShareMilestones: boolean;
  /** Mostrar en el perfil el libro que estoy leyendo. */
  showReadingNow: boolean;
  /** Hasta cuándo se vieron las novedades de amigos (ISO). */
  feedSeenAt?: string;
  /** Semana de liga cuyo resultado ya se mostró. */
  seenLeagueWeek?: string;
  /** Novedades creadas sin conexión, pendientes de publicar. */
  outbox: OutboxPost[];
}

export interface OutboxPost {
  id: string;
  kind: PostKind;
  data: PostData;
  createdAt: number;
}

export function defaultCommunity(): CommunitySettings {
  return { autoShareBooks: true, autoShareMilestones: true, showReadingNow: true, outbox: [] };
}

export interface PersistedState {
  version: number;
  books: Record<string, BookMeta>;
  collections: Collection[];
  bookmarks: Bookmark[];
  highlights: Highlight[];
  reader: ReaderSettings;
  app: AppSettings;
  progress: Progress;
  community: CommunitySettings;
}

export const DEFAULT_READER: ReaderSettings = {
  theme: "paper",
  font: "literata",
  fontSize: 19,
  lineHeight: 1.6,
  margin: 22,
  align: "justify",
  paragraphSpacing: 0.4,
  indent: true,
  hyphenate: true,
  mode: "paged",
  animation: "slide",
  brightness: 1,
  tapZones: true,
  showStatus: true,
  keepAwake: true,
  fullscreen: false,
  ttsRate: 1,
  ttsVoice: "",
  rsvpWpm: 300,
  rsvpChunk: 1,
  pdfZoom: 1,
};

export const DEFAULT_APP: AppSettings = {
  theme: "system",
  accent: "gold",
  dailyGoalMin: 20,
  libraryView: "grid",
  librarySort: "recent",
  trainingSource: "classics",
  sampleOffered: false,
};

export const DEFAULT_PROGRESS: Progress = {
  xp: 0,
  achievements: {},
  days: {},
  games: {},
  wpmHistory: [],
  totalPages: 0,
  totalRsvpWords: 0,
  bestRsvpWpm: 0,
  booksFinished: 0,
  freezes: 1,
  frozenDays: [],
};

export function emptyDay(): DayStats {
  return { ms: 0, pages: 0, words: 0, games: 0, rsvpWords: 0, xp: 0, quests: [] };
}

export function defaultState(): PersistedState {
  return {
    version: STATE_VERSION,
    books: {},
    collections: [],
    bookmarks: [],
    highlights: [],
    reader: { ...DEFAULT_READER },
    app: { ...DEFAULT_APP },
    progress: { ...DEFAULT_PROGRESS, achievements: {}, days: {}, games: {}, wpmHistory: [], frozenDays: [] },
    community: defaultCommunity(),
  };
}

/** Completa con valores por defecto un estado guardado (o importado) antiguo o parcial. */
export function migrateState(raw: unknown): PersistedState {
  const base = defaultState();
  if (!raw || typeof raw !== "object") return base;
  const s = raw as Partial<PersistedState>;
  const books: Record<string, BookMeta> = {};
  for (const [id, b] of Object.entries(s.books ?? {})) {
    if (!b || typeof b !== "object" || !b.id) continue;
    books[id] = {
      ...b,
      author: b.author ?? "",
      collections: Array.isArray(b.collections) ? b.collections : [],
      favorite: !!b.favorite,
      readingMs: b.readingMs ?? 0,
      status: b.status ?? "unread",
    };
  }
  const days: Record<string, DayStats> = {};
  for (const [k, d] of Object.entries(s.progress?.days ?? {})) days[k] = { ...emptyDay(), ...d };
  return {
    version: STATE_VERSION,
    books,
    collections: Array.isArray(s.collections) ? s.collections : base.collections,
    bookmarks: Array.isArray(s.bookmarks) ? s.bookmarks : [],
    highlights: Array.isArray(s.highlights) ? s.highlights : [],
    reader: { ...DEFAULT_READER, ...(s.reader ?? {}) },
    app: { ...DEFAULT_APP, ...(s.app ?? {}) },
    progress: {
      ...DEFAULT_PROGRESS,
      ...(s.progress ?? {}),
      achievements: { ...(s.progress?.achievements ?? {}) },
      games: { ...(s.progress?.games ?? {}) },
      wpmHistory: Array.isArray(s.progress?.wpmHistory) ? s.progress!.wpmHistory : [],
      frozenDays: Array.isArray(s.progress?.frozenDays) ? s.progress!.frozenDays.filter((k) => typeof k === "string") : [],
      freezes: Math.max(0, Math.min(MAX_FREEZES, Number(s.progress?.freezes ?? DEFAULT_PROGRESS.freezes) || 0)),
      days,
    },
    community: {
      ...defaultCommunity(),
      ...(s.community ?? {}),
      outbox: Array.isArray(s.community?.outbox) ? s.community!.outbox : [],
    },
  };
}
