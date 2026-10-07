// Estado persistente de la app: biblioteca, notas, ajustes y progreso.
import type { BookMeta } from "../books/types";

export const STATE_VERSION = 2;

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
  /** Descartado: va a la papelera del cuaderno (se puede recuperar). */
  discardedAt?: number;
}

export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "orange" | "violet";

/** Forma de remarcar un fragmento. */
export type MarkStyle = "highlight" | "underline" | "wavy" | "bold" | "box" | "strike";

export interface Highlight {
  id: string;
  bookId: string;
  chapter: number;
  /** Desplazamientos en el texto plano del capítulo. */
  start: number;
  end: number;
  text: string;
  color: HighlightColor;
  style: MarkStyle;
  note: string;
  /** Avance global aproximado (para ordenar el cuaderno como el libro). */
  percent?: number;
  createdAt: number;
  discardedAt?: number;
}

// --- Escritura a mano -------------------------------------------------------------

export type InkTool = "pen" | "marker";

/**
 * Dónde se ancla un trazo:
 * - "text": a un carácter del capítulo; los puntos van en "em" desde la esquina
 *   superior izquierda de ese carácter, así el trazo acompaña al texto aunque
 *   cambie el tamaño de letra o la paginación.
 * - "page": a la página (PDF original, cómics); los puntos van en fracciones
 *   del ancho de la página.
 */
export type InkAnchor = { kind: "text"; offset: number } | { kind: "page" };

export interface InkStroke {
  id: string;
  tool: InkTool;
  color: string;
  /** Grosor en las mismas unidades que los puntos. */
  width: number;
  /** x0, y0, x1, y1… */
  points: number[];
  anchor: InkAnchor;
  shape?: "line" | "ellipse" | "rect";
}

export interface Drawing {
  id: string;
  bookId: string;
  chapter: number;
  /** "page": páginas originales del PDF; "flow": texto adaptable. */
  view: "page" | "flow";
  strokes: InkStroke[];
  /** Texto cercano (contexto y búsqueda). */
  text: string;
  /** Vista previa guardada en la tabla de medios. */
  mediaId?: string;
  fraction: number;
  percent: number;
  createdAt: number;
  updatedAt: number;
  discardedAt?: number;
}

/** Recorte (captura) de una parte de la página. */
export interface Clip {
  id: string;
  bookId: string;
  chapter: number;
  view: "page" | "flow";
  /** Para volver al lugar: desplazamiento de texto (flow) o fracción de página. */
  offset?: number;
  fraction: number;
  percent: number;
  mediaId: string;
  width: number;
  height: number;
  text: string;
  caption: string;
  createdAt: number;
  discardedAt?: number;
}

export type NoteTint = "lemon" | "peach" | "mint" | "sky" | "lilac";

/** Nota escrita directamente en el cuaderno. */
export interface LooseNote {
  id: string;
  bookId: string;
  text: string;
  tint: NoteTint;
  /** Lugar del libro al que se refiere (opcional). */
  chapter?: number;
  fraction?: number;
  percent?: number;
  createdAt: number;
  updatedAt: number;
  discardedAt?: number;
}

export type NotebookCover = "terracota" | "bosque" | "noche" | "ciruela" | "mostaza" | "oceano" | "rosa" | "grafito";
export type NotebookPaper = "lined" | "dots" | "grid" | "plain";

/** Cuaderno de notas de un libro (aspecto y nombre; las entradas van aparte). */
export interface Notebook {
  bookId: string;
  name: string;
  cover: NotebookCover;
  paper: NotebookPaper;
  sticker: string;
  /** Copia del título y autor por si el libro se borra y se conserva el cuaderno. */
  bookTitle: string;
  bookAuthor: string;
  createdAt: number;
  updatedAt: number;
}

/** Elemento de la lista por leer (un libro de la biblioteca o uno que aún no tienes). */
export interface ReadingListItem {
  id: string;
  bookId?: string;
  title: string;
  author: string;
  note: string;
  addedAt: number;
  doneAt?: number;
  discardedAt?: number;
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
  /** Última forma y color de remarcado usados. */
  markStyle: MarkStyle;
  markColor: HighlightColor;
  inkTool: InkTool | "eraser";
  inkColor: string;
  inkSize: number;
  /** Convierte círculos, líneas y rectángulos dibujados a mano en trazos limpios. */
  inkShapes: boolean;
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
}

export interface PersistedState {
  version: number;
  books: Record<string, BookMeta>;
  collections: Collection[];
  bookmarks: Bookmark[];
  highlights: Highlight[];
  drawings: Drawing[];
  clips: Clip[];
  looseNotes: LooseNote[];
  notebooks: Record<string, Notebook>;
  readingList: ReadingListItem[];
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
  markStyle: "highlight",
  markColor: "yellow",
  inkTool: "pen",
  inkColor: "#e5484d",
  inkSize: 2,
  inkShapes: true,
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
    drawings: [],
    clips: [],
    looseNotes: [],
    notebooks: {},
    readingList: [],
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
  const list = <T,>(v: T[] | undefined, ok: (x: T) => boolean = (x) => !!x) => (Array.isArray(v) ? v.filter(ok) : []);
  const notebooks: Record<string, Notebook> = {};
  for (const [id, n] of Object.entries(s.notebooks ?? {})) {
    if (n && typeof n === "object" && n.bookId) notebooks[id] = n;
  }
  return {
    version: STATE_VERSION,
    books,
    collections: Array.isArray(s.collections) ? s.collections : base.collections,
    bookmarks: list(s.bookmarks),
    // Los subrayados anteriores a los estilos eran todos "resaltados".
    highlights: list(s.highlights).map((h) => (h.style ? h : { ...h, style: "highlight" as const })),
    drawings: list(s.drawings, (d) => !!d?.id && Array.isArray(d.strokes)),
    clips: list(s.clips, (c) => !!c?.id && !!c.mediaId),
    looseNotes: list(s.looseNotes, (n) => !!n?.id),
    notebooks,
    readingList: list(s.readingList, (r) => !!r?.id && typeof r.title === "string"),
    reader: { ...DEFAULT_READER, ...(s.reader ?? {}) },
    app: { ...DEFAULT_APP, ...(s.app ?? {}) },
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
