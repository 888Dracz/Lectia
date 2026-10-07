// El cuaderno de notas de un libro: todo lo remarcado, dibujado, recortado y
// anotado, agrupado por cómo se hizo, con nombre y tapa a elección.
import { ArrowLeft, Download, Ellipsis, Palette, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { strToU8, zip } from "fflate";
import { deliverFile } from "../../backup/backup";
import { openBookContent } from "../../books/load";
import type { BookContent } from "../../books/types";
import { getMedia } from "../../lib/db";
import { formatDate, safeStorage } from "../../lib/util";
import { MARK_STYLES, NOTEBOOK_COVERS } from "../../notes/marks";
import {
  collectEntries,
  countByFilter,
  groupByChapter,
  groupByType,
  groupRecent,
  matchesFilter,
  notebookMarkdown,
  resolveNotebook,
  searchEntries,
  type EntryFilter,
  type NotebookEntry,
} from "../../notes/notebook";
import type { Clip, Drawing, Highlight, LooseNote } from "../../store/state";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { Segmented } from "../components/controls";
import { choiceDialog, confirmDialog } from "../components/Dialog";
import { Sheet } from "../components/Sheet";
import { HighlightSheet } from "../reader/Annotations";
import { entryTarget } from "../reader/jump";
import type { GoTarget } from "../reader/ReflowView";
import { EntryCard } from "./EntryCard";
import { LooseNoteSheet, NotebookCoverArt, NotebookSettingsSheet, PhotoSheet } from "./NotebookSheets";
import { QuoteCardSheet, type CardSource } from "./QuoteCardSheet";

type Group = "type" | "chapter" | "recent";

const FILTER_LABEL: Record<Exclude<EntryFilter, "all" | "discarded">, string> = {
  ...(Object.fromEntries(MARK_STYLES.map((m) => [m.id, m.section])) as Record<(typeof MARK_STYLES)[number]["id"], string>),
  drawing: "Trazos",
  clip: "Recortes",
  note: "Notas",
  bookmark: "Marcadores",
};

const FILTER_ORDER: Exclude<EntryFilter, "all" | "discarded">[] = [...MARK_STYLES.map((m) => m.id), "drawing", "clip", "note", "bookmark"];

/** Títulos de capítulo (cargando el libro si hace falta). */
function useChapterTitles(bookId: string, content?: BookContent | null): (c: number) => string {
  const book = useStore((s) => s.books[bookId]);
  const [loaded, setLoaded] = useState<BookContent | null>(content ?? null);
  useEffect(() => {
    if (content) {
      setLoaded(content);
      return;
    }
    if (!book || book.format === "pdf") return;
    let alive = true;
    openBookContent(book)
      .then((c) => alive && setLoaded(c))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, content]);
  const pdf = book?.format === "pdf" || loaded?.kind === "pdf";
  return useCallback(
    (c: number) => (pdf || loaded?.kind !== "reflow" ? (pdf ? `Página ${c + 1}` : `Capítulo ${c + 1}`) : loaded.chapters[c]?.title?.trim() || `Capítulo ${c + 1}`),
    [pdf, loaded]
  );
}

interface Props {
  bookId: string;
  content?: BookContent | null;
  /** Lugar actual del libro (cuando se abre desde el lector). */
  here?: { chapter: number; fraction: number; percent: number; label: string };
  onBack: () => void;
  onGo: (target: GoTarget) => void;
}

export function NotebookView({ bookId, content, here, onBack, onGo }: Props) {
  const book = useStore((s) => s.books[bookId]);
  const saved = useStore((s) => s.notebooks[bookId]);
  const highlights = useStore((s) => s.highlights);
  const bookmarks = useStore((s) => s.bookmarks);
  const drawings = useStore((s) => s.drawings);
  const clips = useStore((s) => s.clips);
  const looseNotes = useStore((s) => s.looseNotes);
  const nb = resolveNotebook(saved, bookId, book ?? (saved ? { title: saved.bookTitle, author: saved.bookAuthor } : undefined));
  const title = book?.title ?? nb.bookTitle;
  const author = book?.author ?? nb.bookAuthor;
  const chapterTitle = useChapterTitles(bookId, content);

  const [filter, setFilter] = useState<EntryFilter>("all");
  const [group, setGroupState] = useState<Group>(() => (safeStorage.get("lectia-nb-group") as Group) || "type");
  const setGroup = (g: Group) => {
    setGroupState(g);
    safeStorage.set("lectia-nb-group", g);
  };
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [noteSheet, setNoteSheet] = useState<{ note: LooseNote | null } | null>(null);
  const [photo, setPhoto] = useState<{ kind: "clip"; data: Clip } | { kind: "drawing"; data: Drawing } | null>(null);
  const [editing, setEditing] = useState<Highlight | null>(null);
  const [card, setCard] = useState<CardSource | null>(null);

  const entries = useMemo(
    () => collectEntries({ highlights, bookmarks, drawings, clips, looseNotes }, bookId),
    [highlights, bookmarks, drawings, clips, looseNotes, bookId]
  );
  const counts = useMemo(() => countByFilter(entries), [entries]);
  const visible = useMemo(() => searchEntries(entries.filter((e) => matchesFilter(e, filter)), query), [entries, filter, query]);
  const sections = useMemo(() => {
    if (filter === "discarded" || group === "recent") return groupRecent(visible);
    if (group === "chapter") return groupByChapter(visible, chapterTitle);
    return groupByType(visible);
  }, [visible, group, filter, chapterTitle]);

  useEffect(() => {
    if (filter !== "all" && !counts[filter]) setFilter("all");
  }, [counts, filter]);

  const cover = NOTEBOOK_COVERS[nb.cover] ?? NOTEBOOK_COVERS.terracota;
  const store = useStore.getState();

  const discard = (e: NotebookEntry) => {
    store.discardEntry(e.kind, e.id);
    navigator.vibrate?.(8);
    toast("Enviado a Descartados", {
      icon: "🗑️",
      action: { label: "Deshacer", run: () => useStore.getState().restoreEntry(e.kind, e.id) },
    }, 4500);
  };

  const purge = async (e: NotebookEntry) => {
    if (await confirmDialog("¿Borrar para siempre?", "Esta entrada no se podrá recuperar.", "Borrar", true)) store.purgeEntry(e.kind, e.id);
  };

  const go = (e: NotebookEntry) => {
    const t = entryTarget(e);
    if (t && book) onGo(t);
  };

  const exportNotebook = async () => {
    setMenu(false);
    const withImages = entries.some((e) => !e.item.discardedAt && (e.kind === "clip" || (e.kind === "drawing" && e.item.mediaId)));
    let how: string | null = "md";
    if (withImages) {
      how = await choiceDialog("Exportar cuaderno", "¿Con las imágenes de los recortes y trazos?", [
        { label: "Solo texto (.md)", value: "md" },
        { label: "Con imágenes (.zip)", value: "zip", tone: "primary" },
      ]);
      if (!how) return;
    }
    const safe = nb.name.replace(/[\\/:*?"<>|«»]+/g, "").trim().slice(0, 60) || "Cuaderno";
    const date = formatDate(Date.now());
    if (how === "md") {
      const md = notebookMarkdown({ notebook: { ...nb, bookTitle: title, bookAuthor: author }, entries, chapterTitle, date });
      await deliverFile(new File([md], `${safe}.md`, { type: "text/markdown" }), true);
      return;
    }
    const files: Record<string, Uint8Array> = {};
    const images: Record<string, string> = {};
    for (const e of entries) {
      if (e.item.discardedAt || (e.kind !== "clip" && e.kind !== "drawing")) continue;
      const id = e.item.mediaId;
      if (!id) continue;
      const blob = await getMedia(id);
      if (!blob) continue;
      const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png";
      images[id] = `imagenes/${id}.${ext}`;
      files[images[id]] = new Uint8Array(await blob.arrayBuffer());
    }
    files[`${safe}.md`] = strToU8(notebookMarkdown({ notebook: { ...nb, bookTitle: title, bookAuthor: author }, entries, chapterTitle, date, images }));
    const data = await new Promise<Uint8Array>((res, rej) => zip(files, { level: 0 }, (err, out) => (err ? rej(err) : res(out))));
    await deliverFile(new File([data.slice()], `${safe}.zip`, { type: "application/zip" }), true);
  };

  const emptyDiscarded = async () => {
    setMenu(false);
    if (await confirmDialog("¿Vaciar descartados?", `Se borrarán para siempre ${counts.discarded} ${counts.discarded === 1 ? "entrada" : "entradas"}.`, "Vaciar", true)) {
      store.emptyDiscarded(bookId);
      toast("Descartados vaciados");
    }
  };

  const statLine = [
    counts.highlight && `${counts.highlight} resaltado${counts.highlight === 1 ? "" : "s"}`,
    counts.underline && `${counts.underline} subrayado${counts.underline === 1 ? "" : "s"}`,
    counts.wavy && `${counts.wavy} ondulado${counts.wavy === 1 ? "" : "s"}`,
    counts.bold && `${counts.bold} en negrita`,
    counts.box && `${counts.box} recuadro${counts.box === 1 ? "" : "s"}`,
    counts.strike && `${counts.strike} tachado${counts.strike === 1 ? "" : "s"}`,
    counts.drawing && `${counts.drawing} trazo${counts.drawing === 1 ? "" : "s"}`,
    counts.clip && `${counts.clip} recorte${counts.clip === 1 ? "" : "s"}`,
    counts.note && `${counts.note} nota${counts.note === 1 ? "" : "s"}`,
  ].filter(Boolean);

  return (
    <div
      className="nb-screen"
      data-paper={nb.paper}
      style={{ ["--nb-a" as string]: cover.a, ["--nb-b" as string]: cover.b, ["--nb-ink" as string]: cover.ink }}
    >
      <div className="nb-bar">
        <button className="icon-btn" onClick={onBack} aria-label="Volver">
          <ArrowLeft size={23} />
        </button>
        {searching ? (
          <div className="nb-search">
            <Search size={17} className="faint" />
            <input autoFocus value={query} placeholder="Buscar en el cuaderno" onChange={(e) => setQuery(e.target.value)} aria-label="Buscar en el cuaderno" />
            <button
              className="icon-btn"
              aria-label="Cerrar búsqueda"
              onClick={() => {
                setQuery("");
                setSearching(false);
              }}
            >
              <X size={19} />
            </button>
          </div>
        ) : (
          <>
            <span className="nb-bar-title">Cuaderno</span>
            <button className="icon-btn" onClick={() => setSearching(true)} aria-label="Buscar">
              <Search size={21} />
            </button>
            <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Más opciones">
              <Ellipsis size={22} />
            </button>
          </>
        )}
      </div>

      <div className="nb-scroll">
        <button className="nb-hero" onClick={() => setSettings(true)} aria-label="Personalizar cuaderno">
          <NotebookCoverArt nb={nb} />
          <div className="nb-hero-info">
            <div className="eyebrow">Cuaderno</div>
            <div className="nb-hero-name">{nb.name}</div>
            <div className="faint nb-hero-author">
              {title}
              {author ? ` · ${author}` : ""}
            </div>
            <div className="nb-hero-stats">{statLine.length ? statLine.join(" · ") : "Aún en blanco"}</div>
            <span className="nb-hero-edit">
              <Palette size={14} /> Nombre y tapa
            </span>
          </div>
        </button>

        {entries.length > 0 && (
          <>
            <div className="chips nb-chips">
              <button className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
                Todo <span className="count">{counts.all}</span>
              </button>
              {FILTER_ORDER.filter((f) => counts[f] > 0).map((f) => (
                <button key={f} className={`chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                  {FILTER_LABEL[f]} <span className="count">{counts[f]}</span>
                </button>
              ))}
              {counts.discarded > 0 && (
                <button className={`chip dashed ${filter === "discarded" ? "active" : ""}`} onClick={() => setFilter("discarded")}>
                  <Trash2 size={14} /> Descartados <span className="count">{counts.discarded}</span>
                </button>
              )}
            </div>
            {filter !== "discarded" && (
              <div className="nb-group">
                <Segmented
                  value={group}
                  onChange={setGroup}
                  options={[
                    { value: "type", label: "Por tipo" },
                    { value: "chapter", label: "Por capítulo" },
                    { value: "recent", label: "Recientes" },
                  ]}
                />
              </div>
            )}
          </>
        )}

        <div className="nb-paper">
          {entries.length === 0 ? (
            <div className="nb-empty">
              <div className="nb-empty-art hand">¡Hoja en blanco!</div>
              <p>
                Mientras lees, <b>remarca</b> un fragmento (mantén pulsado el texto), usa <b>Dibujar</b> para escribir a mano sobre la página o{" "}
                <b>Recortar</b> para guardar una parte como imagen. Todo llega aquí.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <p className="nb-none faint">{query ? "Nada coincide con tu búsqueda." : "Nada por aquí."}</p>
          ) : (
            sections.map((sec) => (
              <section key={sec.key} className="nb-section">
                <h3 className="nb-section-title">
                  {MARK_STYLES.some((m) => m.id === sec.key) ? (
                    <span className="mk" data-s={sec.key} data-c={(sec.entries[0]?.item as Highlight).color ?? "yellow"}>
                      {sec.title}
                    </span>
                  ) : (
                    <span className="hand nb-section-hand">{filter === "discarded" ? "Descartados" : sec.title}</span>
                  )}
                  <span className="nb-section-count">{sec.entries.length}</span>
                </h3>
                <div className="nb-entries">
                  {sec.entries.map((e) => (
                    <EntryCard
                      key={`${e.kind}-${e.id}`}
                      entry={e}
                      place={e.item.chapter !== undefined ? chapterTitle(e.item.chapter) : "General"}
                      discarded={!!e.item.discardedAt}
                      onGo={book && entryTarget(e) ? () => go(e) : undefined}
                      onDiscard={() => discard(e)}
                      onRestore={() => store.restoreEntry(e.kind, e.id)}
                      onPurge={() => void purge(e)}
                      onEdit={() => {
                        if (e.kind === "highlight") setEditing(e.item);
                        else if (e.kind === "note") setNoteSheet({ note: e.item });
                        else if (e.kind === "clip") setPhoto({ kind: "clip", data: e.item });
                        else if (e.kind === "drawing") setPhoto({ kind: "drawing", data: e.item });
                        else go(e);
                      }}
                      onCard={e.kind === "highlight" ? () => setCard({ text: e.item.text, title, author, highlight: e.item }) : undefined}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <button className="nb-fab" onClick={() => setNoteSheet({ note: null })}>
        <Plus size={20} strokeWidth={2.6} /> Nota
      </button>

      <Sheet open={menu} onClose={() => setMenu(false)}>
        <div className="list">
          <button
            className="list-item"
            onClick={() => {
              setMenu(false);
              setSettings(true);
            }}
          >
            <span className="li-icon">
              <Palette size={18} />
            </span>
            <span className="li-main li-title">Nombre, tapa y hojas</span>
          </button>
          <button className="list-item" onClick={() => void exportNotebook()} disabled={!entries.length}>
            <span className="li-icon">
              <Download size={18} />
            </span>
            <span className="li-main">
              <div className="li-title">Exportar cuaderno</div>
              <div className="li-sub">Markdown, con o sin imágenes</div>
            </span>
          </button>
          {counts.discarded > 0 && (
            <button className="list-item" onClick={() => void emptyDiscarded()}>
              <span className="li-icon" style={{ color: "var(--red)", background: "rgba(255,107,107,.14)" }}>
                <Trash2 size={18} />
              </span>
              <span className="li-main li-title" style={{ color: "var(--red)" }}>
                Vaciar descartados ({counts.discarded})
              </span>
            </button>
          )}
        </div>
      </Sheet>

      <NotebookSettingsSheet open={settings} nb={nb} onClose={() => setSettings(false)} />
      <LooseNoteSheet open={!!noteSheet} bookId={bookId} note={noteSheet?.note ?? null} here={here} onClose={() => setNoteSheet(null)} />
      <PhotoSheet
        item={photo}
        bookTitle={title}
        place={photo ? chapterTitle(photo.data.chapter) : ""}
        onGo={book && photo ? () => go({ kind: photo.kind, id: photo.data.id, item: photo.data } as NotebookEntry) : undefined}
        onClose={() => setPhoto(null)}
      />
      <HighlightSheet
        highlight={editing}
        bookTitle={title}
        onClose={() => setEditing(null)}
        onCard={(h) => setCard({ text: h.text, title, author, highlight: h })}
      />
      <QuoteCardSheet source={card} onClose={() => setCard(null)} />
    </div>
  );
}
