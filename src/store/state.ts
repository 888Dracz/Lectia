// Estado persistente de la app: biblioteca, notas, ajustes y progreso.
import type { BookMeta } from "../books/types";

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

export type ReaderThemeId = "day" | "paper" | "sepia" | "mint" | "dusk" | "night" | "amoled" | "moon" | "custom";

export interface CustomTheme {
  bg: string;
  fg: string;
  link: string;
  dark: boolean;
}

/** Accesos rápidos que se pueden mostrar en la barra de herramientas del lector. */
export type ToolId =
  | "toc" | "format" | "night" | "tts" | "rsvp" | "select" | "search" | "autoscroll"
  | "prevChapter" | "nextChapter" | "prevFile" | "nextFile" | "bookmark" | "brightness"
  | "fontSize" | "orientation" | "info" | "edit";

export const ALL_TOOLS: ToolId[] = [
  "toc", "format", "night", "tts", "rsvp", "select", "search", "autoscroll",
  "prevChapter", "nextChapter", "prevFile", "nextFile", "bookmark", "brightness",
  "fontSize", "orientation", "info", "edit",
];
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

  // --- Pantalla y navegación ---
  /** Deslizar el borde izquierdo ajusta el brillo. */
  edgeBrightness: boolean;
  /** Deslizar el borde derecho ajusta el tamaño de letra. */
  edgeFontSize: boolean;
  /** Pasar página inclinando el dispositivo. */
  tiltPaging: boolean;
  /** Grados de inclinación necesarios (más bajo = más sensible). */
  tiltThreshold: number;
  pageSound: boolean;
  pageSoundVolume: number;
  /** Doble página en pantallas anchas (tabletas o teléfono horizontal). */
  dualPage: "auto" | "on" | "off";
  /** Permitir el modo de desplazamiento vertical. */
  allowScroll: boolean;
  /** Tiempo de lectura restante en la barra de estado. */
  timeLeft: "off" | "chapter" | "book" | "both";
  /** Mini barra de estado (una sola línea fina) en lugar de la completa. */
  miniStatus: boolean;
  /** Mostrar el avance como porcentaje, número de página o ambos. */
  progressDisplay: "percent" | "page" | "both";
  /** Píxeles de los bordes que ignoran toques (pantallas curvas). 0 = desactivado. */
  edgeGuard: number;
  autoScrollSpeed: number;

  // --- Tipografía y formato ---
  cleanEmptyLines: boolean;
  cleanSpaces: boolean;
  trimTop: boolean;
  printedPages: boolean;

  // --- Motor ---
  /** Respetar los estilos CSS que trae el libro. */
  bookStyles: boolean;
  /** Usar las fuentes del libro (si no, se aplica la fuente elegida). */
  publisherFonts: boolean;
  footnotes: "jump" | "popup" | "inline";

  // --- Salud visual ---
  /** Recordatorio de descanso tras N minutos seguidos (0 = apagado). */
  breakReminderMin: number;
  /** Alertas a horas fijas ("22:30"). */
  scheduledAlerts: string[];
  blueFilter: boolean;
  blueOpacity: number;
  /** Temperatura de color del filtro en kelvin (1000–6500). */
  blueTemp: number;
  ruler: boolean;
  rulerHeight: number;
  sentenceStart: boolean;
  bionic: boolean;
  /** Fracción de cada palabra que se resalta en modo biónico. */
  bionicRatio: number;

  // --- Barra de herramientas ---
  toolbarRows: 1 | 2;
  toolbarItems: ToolId[];
  customTheme: CustomTheme;
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
  /** Preguntar antes de guardar un libro que llega desde otra app. */
  confirmExternalSave: boolean;
  sync: SyncConfig;
  dictionary: DictEntry[];
  /** Buscar en un diccionario en línea si la palabra no está en el propio. */
  onlineDictionary: boolean;
}

export type SyncProvider = "none" | "webdav" | "dropbox" | "gdrive" | "ftp";

export interface SyncConfig {
  provider: SyncProvider;
  /** WebDAV / FTP: URL del servidor o carpeta. */
  url: string;
  user: string;
  password: string;
  /** Dropbox / Google Drive: token de acceso OAuth. */
  token: string;
  lastSyncAt?: number;
  auto: boolean;
}

export interface DictEntry {
  word: string;
  definition: string;
  createdAt: number;
}

/** Registro diario de lectura de un libro. */
export interface BookDay {
  ms: number;
  /** Avance global (0–1) al empezar y al terminar ese día. */
  from: number;
  to: number;
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
  edgeBrightness: true,
  edgeFontSize: true,
  tiltPaging: false,
  tiltThreshold: 22,
  pageSound: false,
  pageSoundVolume: 0.5,
  dualPage: "auto",
  allowScroll: true,
  timeLeft: "chapter",
  miniStatus: false,
  progressDisplay: "percent",
  edgeGuard: 0,
  autoScrollSpeed: 30,
  cleanEmptyLines: false,
  cleanSpaces: false,
  trimTop: true,
  printedPages: true,
  bookStyles: false,
  publisherFonts: false,
  footnotes: "popup",
  breakReminderMin: 0,
  scheduledAlerts: [],
  blueFilter: false,
  blueOpacity: 0.3,
  blueTemp: 3000,
  ruler: false,
  rulerHeight: 2.2,
  sentenceStart: false,
  bionic: false,
  bionicRatio: 0.45,
  toolbarRows: 1,
  toolbarItems: ["toc", "format", "night", "tts", "rsvp"],
  customTheme: { bg: "#fdf6e3", fg: "#3b3226", link: "#b05a00", dark: false },
};

export const DEFAULT_SYNC: SyncConfig = { provider: "none", url: "", user: "", password: "", token: "", auto: false };

export const DEFAULT_APP: AppSettings = {
  theme: "system",
  accent: "gold",
  dailyGoalMin: 20,
  libraryView: "grid",
  librarySort: "recent",
  trainingSource: "classics",
  sampleOffered: false,
  confirmExternalSave: true,
  sync: { ...DEFAULT_SYNC },
  dictionary: [],
  onlineDictionary: true,
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
    progress: { ...DEFAULT_PROGRESS, achievements: {}, days: {}, games: {}, wpmHistory: [] },
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
    reader: {
      ...DEFAULT_READER,
      ...(s.reader ?? {}),
      customTheme: { ...DEFAULT_READER.customTheme, ...(s.reader?.customTheme ?? {}) },
      toolbarItems: Array.isArray(s.reader?.toolbarItems) ? s.reader!.toolbarItems.filter((t) => ALL_TOOLS.includes(t)) : [...DEFAULT_READER.toolbarItems],
      scheduledAlerts: Array.isArray(s.reader?.scheduledAlerts) ? s.reader!.scheduledAlerts : [],
    },
    app: {
      ...DEFAULT_APP,
      ...(s.app ?? {}),
      sync: { ...DEFAULT_SYNC, ...(s.app?.sync ?? {}) },
      dictionary: Array.isArray(s.app?.dictionary) ? s.app!.dictionary : [],
    },
    progress: {
      ...DEFAULT_PROGRESS,
      ...(s.progress ?? {}),
      achievements: { ...(s.progress?.achievements ?? {}) },
      games: { ...(s.progress?.games ?? {}) },
      wpmHistory: Array.isArray(s.progress?.wpmHistory) ? s.progress!.wpmHistory : [],
      days,
    },
  };
}
