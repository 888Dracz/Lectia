// Lógica pura de los cuadernos de notas: reunir las entradas de un libro,
// agruparlas por tipo o por capítulo, buscarlas y exportarlas.
import { fold } from "../lib/text";
import { hashString } from "../lib/util";
import type {
  Bookmark,
  Clip,
  Drawing,
  Highlight,
  LooseNote,
  MarkStyle,
  Notebook,
  NotebookCover,
  PersistedState,
} from "../store/state";
import { MARK_STYLES, markStyleInfo, NOTEBOOK_COVER_IDS, NOTEBOOK_STICKERS } from "./marks";

export type EntryKind = "highlight" | "bookmark" | "drawing" | "clip" | "note";

export type NotebookEntry =
  | { kind: "highlight"; id: string; item: Highlight }
  | { kind: "bookmark"; id: string; item: Bookmark }
  | { kind: "drawing"; id: string; item: Drawing }
  | { kind: "clip"; id: string; item: Clip }
  | { kind: "note"; id: string; item: LooseNote };

/** Filtros del cuaderno: cada forma de remarcar va aparte. */
export type EntryFilter = "all" | MarkStyle | "drawing" | "clip" | "bookmark" | "note" | "discarded";

type NotesState = Pick<PersistedState, "highlights" | "bookmarks" | "drawings" | "clips" | "looseNotes">;

export function entryCreatedAt(e: NotebookEntry): number {
  return e.item.createdAt;
}

export function isDiscarded(e: NotebookEntry): boolean {
  return !!e.item.discardedAt;
}

/** Todas las entradas de un libro (incluidas las descartadas). */
export function collectEntries(s: NotesState, bookId: string): NotebookEntry[] {
  const out: NotebookEntry[] = [];
  for (const h of s.highlights) if (h.bookId === bookId) out.push({ kind: "highlight", id: h.id, item: h });
  for (const b of s.bookmarks) if (b.bookId === bookId) out.push({ kind: "bookmark", id: b.id, item: b });
  for (const d of s.drawings) if (d.bookId === bookId) out.push({ kind: "drawing", id: d.id, item: d });
  for (const c of s.clips) if (c.bookId === bookId) out.push({ kind: "clip", id: c.id, item: c });
  for (const n of s.looseNotes) if (n.bookId === bookId) out.push({ kind: "note", id: n.id, item: n });
  return out;
}

/** Cuántas entradas vivas (no descartadas) tiene cada libro. */
export function entryCounts(s: NotesState): Map<string, number> {
  const m = new Map<string, number>();
  const add = (x: { bookId: string; discardedAt?: number }) => {
    if (!x.discardedAt) m.set(x.bookId, (m.get(x.bookId) ?? 0) + 1);
  };
  s.highlights.forEach(add);
  s.bookmarks.forEach(add);
  s.drawings.forEach(add);
  s.clips.forEach(add);
  s.looseNotes.forEach(add);
  return m;
}

export function matchesFilter(e: NotebookEntry, f: EntryFilter): boolean {
  if (f === "discarded") return isDiscarded(e);
  if (isDiscarded(e)) return false;
  if (f === "all") return true;
  if (e.kind === "highlight") return (e.item.style ?? "highlight") === f;
  return e.kind === f;
}

export function countByFilter(entries: NotebookEntry[]): Record<EntryFilter, number> {
  const c = { all: 0, discarded: 0, drawing: 0, clip: 0, bookmark: 0, note: 0 } as Record<EntryFilter, number>;
  for (const m of MARK_STYLES) c[m.id] = 0;
  for (const e of entries) {
    if (isDiscarded(e)) {
      c.discarded++;
      continue;
    }
    c.all++;
    if (e.kind === "highlight") c[e.item.style ?? "highlight"]++;
    else c[e.kind]++;
  }
  return c;
}

/** Texto en el que se busca. */
export function entrySearchText(e: NotebookEntry): string {
  switch (e.kind) {
    case "highlight":
      return `${e.item.text} ${e.item.note}`;
    case "bookmark":
      return e.item.label;
    case "drawing":
      return e.item.text;
    case "clip":
      return `${e.item.caption} ${e.item.text}`;
    case "note":
      return e.item.text;
  }
}

export function searchEntries(entries: NotebookEntry[], query: string): NotebookEntry[] {
  const q = fold(query.trim());
  if (!q) return entries;
  return entries.filter((e) => fold(entrySearchText(e)).includes(q));
}

export function entryChapter(e: NotebookEntry): number | undefined {
  return e.item.chapter;
}

/** Posición aproximada en el libro (0–1) para ordenar como en la lectura. */
export function entryPercent(e: NotebookEntry): number | undefined {
  return e.item.percent;
}

/** Orden de lectura: capítulo, luego avance (o posición del texto), luego fecha. */
export function compareReadingOrder(a: NotebookEntry, b: NotebookEntry): number {
  const ca = entryChapter(a) ?? Number.MAX_SAFE_INTEGER;
  const cb = entryChapter(b) ?? Number.MAX_SAFE_INTEGER;
  if (ca !== cb) return ca - cb;
  if (a.kind === "highlight" && b.kind === "highlight") return a.item.start - b.item.start;
  const pa = entryPercent(a);
  const pb = entryPercent(b);
  if (pa !== undefined && pb !== undefined && pa !== pb) return pa - pb;
  return entryCreatedAt(a) - entryCreatedAt(b);
}

export interface EntrySection {
  key: string;
  title: string;
  entries: NotebookEntry[];
}

const KIND_SECTIONS: { key: Exclude<EntryKind, "highlight">; title: string }[] = [
  { key: "drawing", title: "Trazos a mano" },
  { key: "clip", title: "Recortes" },
  { key: "note", title: "Notas sueltas" },
  { key: "bookmark", title: "Marcadores" },
];

/** Agrupa por forma de remarcar: lo resaltado, lo subrayado, lo recortado… cada cosa aparte. */
export function groupByType(entries: NotebookEntry[]): EntrySection[] {
  const sorted = entries.slice().sort(compareReadingOrder);
  const sections: EntrySection[] = [];
  for (const m of MARK_STYLES) {
    const list = sorted.filter((e) => e.kind === "highlight" && (e.item.style ?? "highlight") === m.id);
    if (list.length) sections.push({ key: m.id, title: m.section, entries: list });
  }
  for (const k of KIND_SECTIONS) {
    const list = sorted.filter((e) => e.kind === k.key);
    if (list.length) sections.push({ key: k.key, title: k.title, entries: list });
  }
  return sections;
}

/** Agrupa por capítulo (en orden de lectura). */
export function groupByChapter(entries: NotebookEntry[], chapterTitle: (c: number) => string): EntrySection[] {
  const sorted = entries.slice().sort(compareReadingOrder);
  const sections: EntrySection[] = [];
  for (const e of sorted) {
    const c = entryChapter(e);
    const key = c === undefined ? "general" : `c${c}`;
    let sec = sections[sections.length - 1];
    if (!sec || sec.key !== key) {
      sec = { key, title: c === undefined ? "Notas generales" : chapterTitle(c) || `Capítulo ${c + 1}`, entries: [] };
      sections.push(sec);
    }
    sec.entries.push(e);
  }
  return sections;
}

/** Más recientes primero. */
export function groupRecent(entries: NotebookEntry[]): EntrySection[] {
  const sorted = entries.slice().sort((a, b) => entryCreatedAt(b) - entryCreatedAt(a));
  return sorted.length ? [{ key: "recent", title: "Lo más reciente", entries: sorted }] : [];
}

// --- Aspecto del cuaderno -----------------------------------------------------------

export function defaultNotebookName(title: string): string {
  const t = title.trim() || "este libro";
  return `Notas de «${t.length > 42 ? `${t.slice(0, 40).trim()}…` : t}»`;
}

export function defaultCover(bookId: string): NotebookCover {
  return NOTEBOOK_COVER_IDS[hashString(bookId) % NOTEBOOK_COVER_IDS.length];
}

/** El cuaderno de un libro, aunque aún no se haya personalizado. */
export function resolveNotebook(
  saved: Notebook | undefined,
  bookId: string,
  book: { title: string; author: string } | undefined,
  now = Date.now()
): Notebook {
  if (saved) return saved;
  const title = book?.title ?? "";
  return {
    bookId,
    name: defaultNotebookName(title),
    cover: defaultCover(bookId),
    paper: "lined",
    sticker: NOTEBOOK_STICKERS[hashString(`${bookId}s`) % NOTEBOOK_STICKERS.length],
    bookTitle: title,
    bookAuthor: book?.author ?? "",
    createdAt: now,
    updatedAt: now,
  };
}

/** La frase del día: un subrayado elegido de forma estable para cada fecha. */
export function quoteOfTheDay(highlights: Highlight[], day: string): Highlight | undefined {
  const pool = highlights.filter((h) => !h.discardedAt && h.text.length >= 20 && h.text.length <= 420);
  if (!pool.length) return undefined;
  return pool[hashString(day) % pool.length];
}

// --- Exportar -------------------------------------------------------------------------

export function notebookMarkdown(opts: {
  notebook: Notebook;
  entries: NotebookEntry[];
  chapterTitle: (c: number) => string;
  date: string;
  /** Rutas de las imágenes dentro del archivo exportado (por id de medio). */
  images?: Record<string, string>;
}): string {
  const { notebook, entries, chapterTitle, date, images = {} } = opts;
  const lines = [`# ${notebook.name}`, "", `*${notebook.bookTitle}${notebook.bookAuthor ? ` — ${notebook.bookAuthor}` : ""}*`, "", `Exportado desde Lectia el ${date}.`];
  const live = entries.filter((e) => !isDiscarded(e));
  for (const sec of groupByType(live)) {
    lines.push("", `## ${sec.title}`, "");
    for (const e of sec.entries) {
      const where = e.item.chapter !== undefined ? chapterTitle(e.item.chapter) : "";
      switch (e.kind) {
        case "highlight": {
          const t = e.item.text.replace(/\s+/g, " ").trim();
          const styled =
            e.item.style === "bold" ? `**${t}**` : e.item.style === "strike" ? `~~${t}~~` : e.item.style === "highlight" ? `==${t}==` : t;
          lines.push(`> ${styled}`);
          if (where) lines.push(`> — *${where}*`);
          if (e.item.note) lines.push("", `📝 ${e.item.note}`);
          lines.push("");
          break;
        }
        case "bookmark":
          lines.push(`- 🔖 ${e.item.label} (${Math.round(e.item.percent * 100)}%)`);
          break;
        case "drawing": {
          lines.push(`- ✍️ Trazo a mano${where ? ` en *${where}*` : ""}${e.item.text ? `: «${e.item.text.slice(0, 160)}»` : ""}`);
          const img = e.item.mediaId && images[e.item.mediaId];
          if (img) lines.push("", `  ![Trazo a mano](${img})`, "");
          break;
        }
        case "clip": {
          lines.push(`- ✂️ Recorte${where ? ` de *${where}*` : ""}${e.item.caption ? ` — ${e.item.caption}` : ""}`);
          const img = images[e.item.mediaId];
          if (img) lines.push("", `  ![${e.item.caption || "Recorte"}](${img})`, "");
          else if (e.item.text) lines.push(`  > ${e.item.text.replace(/\s+/g, " ").slice(0, 400)}`);
          break;
        }
        case "note":
          lines.push(`- 🗒️ ${e.item.text.replace(/\n+/g, "\n  ")}${where ? ` *(${where})*` : ""}`);
          break;
      }
    }
  }
  if (!live.length) lines.push("", "_Este cuaderno aún está en blanco._");
  return lines.join("\n") + "\n";
}

export { markStyleInfo };
