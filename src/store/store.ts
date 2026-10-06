// Store principal (zustand). Se guarda en IndexedDB automáticamente.
import { create } from "zustand";
import type { BookMeta, ReadingLocation } from "../books/types";
import { deleteCover, deleteFile, getKV, setKV } from "../lib/db";
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
  type Collection,
  type DayStats,
  type GameId,
  type Highlight,
  type PersistedState,
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
  removeBook: (id: string) => Promise<void>;
  setLocation: (id: string, loc: Omit<ReadingLocation, "updatedAt">) => void;
  setFinished: (id: string, finished: boolean) => void;
  toggleFavorite: (id: string) => void;
  createCollection: (name: string, emoji: string) => string;
  updateCollection: (id: string, patch: Partial<Collection>) => void;
  deleteCollection: (id: string) => void;
  toggleBookCollection: (bookId: string, collectionId: string) => void;
  addBookmark: (b: Omit<Bookmark, "id" | "createdAt">) => void;
  removeBookmark: (id: string) => void;
  addHighlight: (h: Omit<Highlight, "id" | "createdAt">) => Highlight;
  updateHighlight: (id: string, patch: Partial<Highlight>) => void;
  removeHighlight: (id: string) => void;
  setReader: (patch: Partial<ReaderSettings>) => void;
  setApp: (patch: Partial<AppSettings>) => void;
  logReading: (bookId: string, ms: number, pages: number, percent?: number) => void;
  /** Anota el avance del día del libro (para su historial). */
  notePercent: (bookId: string, percent: number) => void;
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
      get().checkAchievements();
    },

    updateBook: (id, patch) => {
      const b = get().books[id];
      if (b) set({ books: { ...get().books, [id]: { ...b, ...patch } } });
    },

    removeBook: async (id) => {
      const { [id]: _removed, ...rest } = get().books;
      void _removed;
      set({
        books: rest,
        bookmarks: get().bookmarks.filter((b) => b.bookId !== id),
        highlights: get().highlights.filter((h) => h.bookId !== id),
      });
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

    setReader: (patch) => set({ reader: { ...get().reader, ...patch } }),

    setApp: (patch) => {
      set({ app: { ...get().app, ...patch } });
      if (patch.lastBackupAt) get().checkAchievements();
    },

    notePercent: (bookId, percent) => {
      const b = get().books[bookId];
      if (!b) return;
      const key = dayKey();
      const h = b.history?.[key];
      const day = h ? { ...h, to: percent } : { ms: 0, from: percent, to: percent };
      if (h && h.to === percent) return;
      get().updateBook(bookId, { history: { ...(b.history ?? {}), [key]: day } });
    },

    logReading: (bookId, ms, pages, percent) => {
      if (ms <= 0 && pages <= 0) return;
      const before = get().progress.days[dayKey()]?.ms ?? 0;
      const b = get().books[bookId];
      if (b) {
        const key = dayKey();
        const h = b.history?.[key] ?? { ms: 0, from: percent ?? b.location?.percent ?? 0, to: percent ?? b.location?.percent ?? 0 };
        const day = { ...h, ms: h.ms + ms, to: percent ?? h.to };
        get().updateBook(bookId, { readingMs: (b.readingMs || 0) + ms, lastOpenedAt: Date.now(), history: { ...(b.history ?? {}), [key]: day } });
      }
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
