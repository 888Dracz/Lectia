// Store principal (zustand). Se guarda en IndexedDB automáticamente.
import { create } from "zustand";
import type { BookMeta, ReadingLocation } from "../books/types";
import { deleteCover, deleteFile, deleteMedia, getKV, setKV } from "../lib/db";
import { findWishFor, isActiveItem, moveActive } from "../notes/readingList";
import { resolveNotebook, type EntryKind } from "../notes/notebook";
import { dayKey, debounce, uid } from "../lib/util";
import {
  ACHIEVEMENTS,
  computeStreak,
  dailyQuests,
  levelFromXp,
  newlyUnlocked,
  XP_PER_MINUTE,
} from "./gamification";
import {
  defaultState,
  emptyDay,
  migrateState,
  type AppSettings,
  type Bookmark,
  type Clip,
  type Collection,
  type DayStats,
  type Drawing,
  type GameId,
  type Highlight,
  type LooseNote,
  type Notebook,
  type PersistedState,
  type ReadingListItem,
  type ReaderSettings,
  type WpmSample,
} from "./state";
import { useUi } from "./ui";

interface Actions {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  replaceState: (s: PersistedState) => void;
  addBook: (meta: BookMeta) => void;
  updateBook: (id: string, patch: Partial<BookMeta>) => void;
  /** Borra un libro. Con `keepNotes`, su cuaderno se conserva. */
  removeBook: (id: string, keepNotes?: boolean) => Promise<void>;
  setLocation: (id: string, loc: Omit<ReadingLocation, "updatedAt">) => void;
  setFinished: (id: string, finished: boolean) => void;
  toggleFavorite: (id: string) => void;
  createCollection: (name: string, emoji: string) => string;
  updateCollection: (id: string, patch: Partial<Collection>) => void;
  deleteCollection: (id: string) => void;
  toggleBookCollection: (bookId: string, collectionId: string) => void;
  addBookmark: (b: Omit<Bookmark, "id" | "createdAt">) => void;
  updateBookmark: (id: string, patch: Partial<Bookmark>) => void;
  removeBookmark: (id: string) => void;
  addHighlight: (h: Omit<Highlight, "id" | "createdAt">) => Highlight;
  updateHighlight: (id: string, patch: Partial<Highlight>) => void;
  removeHighlight: (id: string) => void;
  addDrawing: (d: Omit<Drawing, "id" | "createdAt" | "updatedAt">) => Drawing;
  updateDrawing: (id: string, patch: Partial<Drawing>) => void;
  addClip: (c: Omit<Clip, "id" | "createdAt">) => Clip;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  addLooseNote: (n: Omit<LooseNote, "id" | "createdAt" | "updatedAt">) => LooseNote;
  updateLooseNote: (id: string, patch: Partial<LooseNote>) => void;
  /** Manda una entrada del cuaderno a "Descartados" (se puede recuperar). */
  discardEntry: (kind: EntryKind, id: string) => void;
  restoreEntry: (kind: EntryKind, id: string) => void;
  /** Borra una entrada para siempre (y su imagen, si tiene). */
  purgeEntry: (kind: EntryKind, id: string) => void;
  emptyDiscarded: (bookId: string) => void;
  setNotebook: (bookId: string, patch: Partial<Notebook>) => void;
  addToReadingList: (item: { bookId?: string; title: string; author?: string; note?: string }) => string | null;
  updateReadingItem: (id: string, patch: Partial<ReadingListItem>) => void;
  moveReadingItem: (id: string, to: number) => void;
  removeReadingItem: (id: string) => void;
  setReader: (patch: Partial<ReaderSettings>) => void;
  setApp: (patch: Partial<AppSettings>) => void;
  logReading: (bookId: string, ms: number, pages: number) => void;
  logGame: (game: GameId, score: number, xp: number) => void;
  logRsvp: (words: number, wpm: number, ms: number) => void;
  logWpmTest: (sample: Omit<WpmSample, "at">) => void;
  addXp: (amount: number, reason?: string) => void;
  checkAchievements: () => void;
  unlock: (id: string) => void;
}

export type Store = PersistedState & Actions;

const STATE_KEY = "state";

function persistedOf(s: Store): PersistedState {
  return {
    version: s.version,
    books: s.books,
    collections: s.collections,
    bookmarks: s.bookmarks,
    highlights: s.highlights,
    drawings: s.drawings,
    clips: s.clips,
    looseNotes: s.looseNotes,
    notebooks: s.notebooks,
    readingList: s.readingList,
    reader: s.reader,
    app: s.app,
    progress: s.progress,
  };
}

export const useStore = create<Store>((set, get) => {
  const updateDay = (fn: (d: DayStats) => DayStats) => {
    const key = dayKey();
    const p = get().progress;
    set({ progress: { ...p, days: { ...p.days, [key]: fn({ ...emptyDay(), ...p.days[key] }) } } });
  };

  const checkQuests = () => {
    const s = get();
    const key = dayKey();
    const day = s.progress.days[key];
    if (!day) return;
    for (const q of dailyQuests(day, s.app.dailyGoalMin)) {
      if (q.progress >= q.target && !day.quests.includes(q.id)) {
        updateDay((d) => ({ ...d, quests: [...d.quests, q.id] }));
        get().addXp(q.xp);
        useUi.getState().toast({ text: `Reto cumplido: ${q.title}`, icon: q.icon, tone: "success" }, 3500);
      }
    }
  };

  type Entry = { id: string; bookId: string; discardedAt?: number; mediaId?: string };
  const KEY = { highlight: "highlights", bookmark: "bookmarks", drawing: "drawings", clip: "clips", note: "looseNotes" } as const;
  const entries = (kind: EntryKind) => get()[KEY[kind]] as Entry[];
  const setEntries = (kind: EntryKind, list: Entry[]) => set({ [KEY[kind]]: list } as unknown as Partial<Store>);
  const patchEntry = (kind: EntryKind, id: string, patch: Partial<Entry>) =>
    setEntries(kind, entries(kind).map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const dropMedia = (list: Entry[]) => {
    for (const x of list) if (x.mediaId) void deleteMedia(x.mediaId).catch(() => undefined);
  };

  return {
    ...defaultState(),
    hydrated: false,

    hydrate: async () => {
      try {
        const raw = await getKV<PersistedState>(STATE_KEY);
        set({ ...migrateState(raw), hydrated: true });
      } catch {
        set({ hydrated: true });
      }
    },

    replaceState: (s) => set({ ...migrateState(s) }),

    addBook: (meta) => {
      set({ books: { ...get().books, [meta.id]: meta } });
      // ¿Estaba en la lista por leer como deseo? Se vincula.
      const wish = findWishFor(get().readingList, meta.title);
      if (wish) {
        get().updateReadingItem(wish.id, { bookId: meta.id });
        useUi.getState().toast({ text: `“${meta.title}” estaba en tu lista por leer`, icon: "🗒️" }, 3500);
      }
      get().checkAchievements();
    },

    updateBook: (id, patch) => {
      const b = get().books[id];
      if (b) set({ books: { ...get().books, [id]: { ...b, ...patch } } });
    },

    removeBook: async (id, keepNotes = false) => {
      const s = get();
      const book = s.books[id];
      const { [id]: _removed, ...rest } = s.books;
      void _removed;
      // En la lista por leer queda como deseo (sin archivo).
      const readingList = s.readingList.map((i) => (i.bookId === id ? { ...i, bookId: undefined } : i));
      if (keepNotes && book) {
        const nb = resolveNotebook(s.notebooks[id], id, book);
        set({
          books: rest,
          readingList,
          notebooks: { ...s.notebooks, [id]: { ...nb, bookTitle: book.title, bookAuthor: book.author } },
        });
      } else {
        dropMedia([...s.drawings, ...s.clips].filter((x) => x.bookId === id));
        const { [id]: _nb, ...notebooks } = s.notebooks;
        void _nb;
        set({
          books: rest,
          readingList,
          notebooks,
          bookmarks: s.bookmarks.filter((b) => b.bookId !== id),
          highlights: s.highlights.filter((h) => h.bookId !== id),
          drawings: s.drawings.filter((d) => d.bookId !== id),
          clips: s.clips.filter((c) => c.bookId !== id),
          looseNotes: s.looseNotes.filter((n) => n.bookId !== id),
        });
      }
      await Promise.all([deleteFile(id), deleteCover(id)]);
    },

    setLocation: (id, loc) => {
      const b = get().books[id];
      if (!b) return;
      const status = b.status === "unread" ? "reading" : b.status;
      set({ books: { ...get().books, [id]: { ...b, status, location: { ...loc, updatedAt: Date.now() } } } });
    },

    setFinished: (id, finished) => {
      const b = get().books[id];
      if (!b) return;
      const wasFinished = b.status === "finished";
      get().updateBook(id, {
        status: finished ? "finished" : b.location ? "reading" : "unread",
        finishedAt: finished ? Date.now() : undefined,
      });
      if (finished && !wasFinished) {
        const p = get().progress;
        set({ progress: { ...p, booksFinished: p.booksFinished + 1 } });
        const listed = get().readingList.find((i) => i.bookId === id && isActiveItem(i));
        if (listed) {
          get().updateReadingItem(listed.id, { doneAt: Date.now() });
          useUi.getState().toast({ text: "Tachado de tu lista por leer", icon: "✅", tone: "success" }, 3500);
        }
        get().addXp(100, "¡Libro terminado!");
        useUi.getState().celebrate({ kind: "achievement", title: "¡Libro terminado!", subtitle: b.title, icon: "🏁" });
        get().checkAchievements();
      } else if (!finished && wasFinished) {
        const p = get().progress;
        set({ progress: { ...p, booksFinished: Math.max(0, p.booksFinished - 1) } });
      }
    },

    toggleFavorite: (id) => {
      const b = get().books[id];
      if (b) get().updateBook(id, { favorite: !b.favorite });
    },

    createCollection: (name, emoji) => {
      const id = uid("col");
      set({ collections: [...get().collections, { id, name: name.trim() || "Estantería", emoji: emoji || "📚", createdAt: Date.now() }] });
      get().checkAchievements();
      return id;
    },

    updateCollection: (id, patch) =>
      set({ collections: get().collections.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),

    deleteCollection: (id) => {
      const books = { ...get().books };
      for (const b of Object.values(books)) {
        if (b.collections.includes(id)) books[b.id] = { ...b, collections: b.collections.filter((c) => c !== id) };
      }
      set({ collections: get().collections.filter((c) => c.id !== id), books });
    },

    toggleBookCollection: (bookId, collectionId) => {
      const b = get().books[bookId];
      if (!b) return;
      const has = b.collections.includes(collectionId);
      get().updateBook(bookId, {
        collections: has ? b.collections.filter((c) => c !== collectionId) : [...b.collections, collectionId],
      });
    },

    addBookmark: (b) => {
      set({ bookmarks: [...get().bookmarks, { ...b, id: uid("bm"), createdAt: Date.now() }] });
      get().checkAchievements();
    },

    updateBookmark: (id, patch) => set({ bookmarks: get().bookmarks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }),

    removeBookmark: (id) => set({ bookmarks: get().bookmarks.filter((b) => b.id !== id) }),

    addHighlight: (h) => {
      const full: Highlight = { ...h, id: uid("hl"), createdAt: Date.now() };
      set({ highlights: [...get().highlights, full] });
      get().checkAchievements();
      return full;
    },

    updateHighlight: (id, patch) =>
      set({ highlights: get().highlights.map((h) => (h.id === id ? { ...h, ...patch } : h)) }),

    removeHighlight: (id) => set({ highlights: get().highlights.filter((h) => h.id !== id) }),

    addDrawing: (d) => {
      const now = Date.now();
      const full: Drawing = { ...d, id: uid("ink"), createdAt: now, updatedAt: now };
      set({ drawings: [...get().drawings, full] });
      get().checkAchievements();
      return full;
    },

    updateDrawing: (id, patch) =>
      set({ drawings: get().drawings.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d)) }),

    addClip: (c) => {
      const full: Clip = { ...c, id: uid("clip"), createdAt: Date.now() };
      set({ clips: [...get().clips, full] });
      get().checkAchievements();
      return full;
    },

    updateClip: (id, patch) => set({ clips: get().clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),

    addLooseNote: (n) => {
      const now = Date.now();
      const full: LooseNote = { ...n, id: uid("note"), createdAt: now, updatedAt: now };
      set({ looseNotes: [...get().looseNotes, full] });
      return full;
    },

    updateLooseNote: (id, patch) =>
      set({ looseNotes: get().looseNotes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)) }),

    discardEntry: (kind, id) => patchEntry(kind, id, { discardedAt: Date.now() }),

    restoreEntry: (kind, id) => patchEntry(kind, id, { discardedAt: undefined }),

    purgeEntry: (kind, id) => {
      const list = entries(kind);
      dropMedia(list.filter((x) => x.id === id));
      setEntries(kind, list.filter((x) => x.id !== id));
    },

    emptyDiscarded: (bookId) => {
      for (const kind of Object.keys(KEY) as EntryKind[]) {
        const list = entries(kind);
        const gone = list.filter((x) => x.bookId === bookId && x.discardedAt);
        if (!gone.length) continue;
        dropMedia(gone);
        setEntries(kind, list.filter((x) => !gone.includes(x)));
      }
    },

    setNotebook: (bookId, patch) => {
      const s = get();
      const book = s.books[bookId];
      const nb = resolveNotebook(s.notebooks[bookId], bookId, book);
      set({
        notebooks: {
          ...s.notebooks,
          [bookId]: { ...nb, ...(book ? { bookTitle: book.title, bookAuthor: book.author } : {}), ...patch, updatedAt: Date.now() },
        },
      });
      get().checkAchievements();
    },

    addToReadingList: ({ bookId, title, author = "", note = "" }) => {
      const list = get().readingList;
      if (bookId) {
        const existing = list.find((i) => i.bookId === bookId);
        if (existing && isActiveItem(existing)) return null;
        // Si estaba leído o descartado, vuelve a la lista.
        if (existing) {
          set({ readingList: [...list.filter((i) => i !== existing), { ...existing, doneAt: undefined, discardedAt: undefined, addedAt: Date.now() }] });
          return existing.id;
        }
      }
      const item: ReadingListItem = { id: uid("rl"), bookId, title: title.trim(), author: author.trim(), note: note.trim(), addedAt: Date.now() };
      // Los nuevos van al final de los pendientes (antes de leídos y descartados).
      const active = list.filter(isActiveItem);
      set({ readingList: [...active, item, ...list.filter((i) => !isActiveItem(i))] });
      get().checkAchievements();
      return item.id;
    },

    updateReadingItem: (id, patch) => {
      const list = get().readingList;
      const before = list.find((i) => i.id === id);
      if (!before) return;
      const after = { ...before, ...patch };
      let next = list.map((i) => (i.id === id ? after : i));
      // Al salir o volver a los pendientes se reacomoda: pendientes primero.
      if (isActiveItem(before) !== isActiveItem(after)) next = [...next.filter(isActiveItem), ...next.filter((i) => !isActiveItem(i))];
      set({ readingList: next });
      get().checkAchievements();
    },

    moveReadingItem: (id, to) => set({ readingList: moveActive(get().readingList, id, to) }),

    removeReadingItem: (id) => set({ readingList: get().readingList.filter((i) => i.id !== id) }),

    setReader: (patch) => set({ reader: { ...get().reader, ...patch } }),

    setApp: (patch) => {
      set({ app: { ...get().app, ...patch } });
      if (patch.lastBackupAt) get().checkAchievements();
    },

    logReading: (bookId, ms, pages) => {
      if (ms <= 0 && pages <= 0) return;
      const before = get().progress.days[dayKey()]?.ms ?? 0;
      const b = get().books[bookId];
      if (b) get().updateBook(bookId, { readingMs: (b.readingMs || 0) + ms, lastOpenedAt: Date.now() });
      updateDay((d) => ({ ...d, ms: d.ms + ms, pages: d.pages + pages }));
      const p = get().progress;
      set({ progress: { ...p, totalPages: p.totalPages + pages } });
      // XP: 2 por cada minuto completo leído hoy.
      const gained = Math.floor((before + ms) / 60000) - Math.floor(before / 60000);
      if (gained > 0) get().addXp(gained * XP_PER_MINUTE);
      const h = new Date().getHours();
      if (ms > 0 && h < 5) get().unlock("night-owl");
      if (ms > 0 && h >= 5 && h < 7) get().unlock("early-bird");
      checkQuests();
      get().checkAchievements();
    },

    logGame: (game, score, xp) => {
      const p = get().progress;
      const rec = p.games[game] ?? { plays: 0, best: 0, lastAt: 0 };
      set({
        progress: {
          ...p,
          games: { ...p.games, [game]: { plays: rec.plays + 1, best: Math.max(rec.best, score), lastAt: Date.now() } },
        },
      });
      if (game !== "rsvp") updateDay((d) => ({ ...d, games: d.games + 1 }));
      if (xp > 0) get().addXp(xp);
      checkQuests();
      get().checkAchievements();
    },

    logRsvp: (words, wpm, ms) => {
      if (words <= 0) return;
      const p = get().progress;
      set({
        progress: {
          ...p,
          totalRsvpWords: p.totalRsvpWords + words,
          bestRsvpWpm: words >= 50 ? Math.max(p.bestRsvpWpm, wpm) : p.bestRsvpWpm,
        },
      });
      updateDay((d) => ({ ...d, rsvpWords: d.rsvpWords + words, words: d.words + words, ms: d.ms + ms }));
      get().addXp(Math.max(1, Math.round(words / 50)));
      checkQuests();
      get().checkAchievements();
    },

    logWpmTest: (sample) => {
      const p = get().progress;
      set({ progress: { ...p, wpmHistory: [...p.wpmHistory, { ...sample, at: Date.now() }].slice(-100) } });
    },

    addXp: (amount, reason) => {
      if (amount <= 0) return;
      const p = get().progress;
      const before = levelFromXp(p.xp).level;
      set({ progress: { ...p, xp: p.xp + amount } });
      updateDay((d) => ({ ...d, xp: d.xp + amount }));
      const info = levelFromXp(p.xp + amount);
      if (reason) useUi.getState().toast({ text: `${reason} +${amount} ✨`, tone: "xp" });
      if (info.level > before) {
        useUi.getState().celebrate({
          kind: "level",
          title: `¡Nivel ${info.level}!`,
          subtitle: `Ahora eres ${info.rank.name} ${info.rank.emoji}`,
          icon: info.rank.emoji,
        });
      }
    },

    unlock: (id) => {
      if (get().progress.achievements[id]) return;
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (!a) return;
      const p = get().progress;
      set({ progress: { ...p, achievements: { ...p.achievements, [id]: Date.now() } } });
      useUi.getState().celebrate({ kind: "achievement", title: a.title, subtitle: a.description, icon: a.icon });
      get().addXp(a.xp);
    },

    checkAchievements: () => {
      const s = get();
      const ctx = {
        state: persistedOf(s),
        books: Object.values(s.books),
        streak: computeStreak(s.progress.days).current,
      };
      for (const a of newlyUnlocked(ctx)) get().unlock(a.id);
    },
  };
});

// --- Persistencia -----------------------------------------------------------

const save = debounce(() => {
  const s = useStore.getState();
  if (!s.hydrated) return;
  void setKV(STATE_KEY, persistedOf(s)).catch((e) => console.error("No se pudo guardar", e));
}, 500);

useStore.subscribe((s, prev) => {
  if (!s.hydrated) return;
  if (
    s.books !== prev.books ||
    s.collections !== prev.collections ||
    s.bookmarks !== prev.bookmarks ||
    s.highlights !== prev.highlights ||
    s.drawings !== prev.drawings ||
    s.clips !== prev.clips ||
    s.looseNotes !== prev.looseNotes ||
    s.notebooks !== prev.notebooks ||
    s.readingList !== prev.readingList ||
    s.reader !== prev.reader ||
    s.app !== prev.app ||
    s.progress !== prev.progress
  ) {
    save();
  }
});

/** Guarda inmediatamente (al salir de la app o antes de un respaldo). */
export function flushSave(): void {
  save();
  save.flush();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
  window.addEventListener("pagehide", flushSave);
}

export function getPersisted(): PersistedState {
  return persistedOf(useStore.getState());
}

export const useBooks = () => useStore((s) => s.books);
