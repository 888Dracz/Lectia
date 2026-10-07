import { Bookmark, Eraser, NotebookPen, NotebookText, Plus, StickyNote, Trash } from "lucide-react";
import { useMemo, useState } from "react";
import type { BookContent, BookMeta } from "../../books/types";
import { formatDate } from "../../lib/util";
import { markStyleInfo, NOTE_TINTS } from "../../notes/marks";
import type { Bookmark as BookmarkT, Highlight, LooseNote } from "../../store/state";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { Segmented } from "../components/controls";
import { Sheet } from "../components/Sheet";
import { discardHighlight, MarkSample } from "./Annotations";
import { HIGHLIGHT_COLORS } from "./themes";

interface Props {
  open: boolean;
  onClose: () => void;
  book: BookMeta;
  content: BookContent;
  currentChapter: number;
  onGoChapter: (chapter: number, anchor?: string) => void;
  onGoBookmark: (b: BookmarkT) => void;
  onGoHighlight: (h: Highlight) => void;
  onEditHighlight: (h: Highlight) => void;
  onOpenNotebook: () => void;
  /** Abre una nota suelta para editarla (null: nota nueva). */
  onEditNote: (n: LooseNote | null) => void;
  onGoNote: (n: LooseNote) => void;
}

/** Borra una nota suelta (va a "Descartados" del cuaderno) con opción de deshacer. */
function deleteLooseNote(n: LooseNote) {
  useStore.getState().discardEntry("note", n.id);
  toast("Nota borrada", {
    icon: "🗑️",
    action: { label: "Deshacer", run: () => useStore.getState().restoreEntry("note", n.id) },
  }, 5000);
}

export function TocSheet({ open, onClose, book, content, currentChapter, onGoChapter, onGoBookmark, onGoHighlight, onEditHighlight, onOpenNotebook, onEditNote, onGoNote }: Props) {
  const [tab, setTab] = useState<"toc" | "marks" | "notes">("toc");
  const allBookmarks = useStore((s) => s.bookmarks);
  const allHighlights = useStore((s) => s.highlights);
  const allNotes = useStore((s) => s.looseNotes);
  const removeBookmark = useStore((s) => s.removeBookmark);
  const bookmarks = useMemo(
    () => allBookmarks.filter((b) => b.bookId === book.id && !b.discardedAt).sort((a, b) => a.percent - b.percent),
    [allBookmarks, book.id]
  );
  const highlights = useMemo(
    () => allHighlights.filter((h) => h.bookId === book.id && !h.discardedAt).sort((a, b) => a.chapter - b.chapter || a.start - b.start),
    [allHighlights, book.id]
  );
  const notes = useMemo(
    () =>
      allNotes
        .filter((n) => n.bookId === book.id && !n.discardedAt)
        .sort((a, b) => (a.percent ?? Infinity) - (b.percent ?? Infinity) || b.updatedAt - a.updatedAt),
    [allNotes, book.id]
  );
  const noteCount = highlights.length + notes.length;
  const toc = content.toc;
  const currentTocIndex = useMemo(() => {
    let idx = -1;
    toc.forEach((t, i) => {
      if (t.chapter <= currentChapter) idx = i;
    });
    return idx;
  }, [toc, currentChapter]);

  const chapterTitle = (c: number) =>
    content.kind === "pdf" ? `Página ${c + 1}` : content.chapters[c]?.title ?? `Capítulo ${c + 1}`;

  return (
    <Sheet open={open} onClose={onClose} title={book.title} height="82dvh">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "toc", label: "Contenido" },
          { value: "marks", label: `Marcadores${bookmarks.length ? ` · ${bookmarks.length}` : ""}` },
          { value: "notes", label: `Notas${noteCount ? ` · ${noteCount}` : ""}` },
        ]}
      />

      {tab === "toc" && (
        <div className="toc-list">
          {toc.length === 0 && <p className="faint toc-empty">Este libro no tiene índice.</p>}
          {toc.map((t, i) => (
            <button
              key={i}
              className={`toc-item ${i === currentTocIndex ? "current" : ""}`}
              style={{ paddingLeft: 12 + Math.min(t.level, 4) * 16 }}
              onClick={() => onGoChapter(t.chapter, t.anchor)}
            >
              <span className="toc-title">{t.title}</span>
              {content.kind === "pdf" && <span className="toc-page">{t.chapter + 1}</span>}
            </button>
          ))}
        </div>
      )}

      {tab === "marks" && (
        <div className="notes-list">
          {bookmarks.length === 0 && (
            <div className="notes-empty">
              <Bookmark size={30} />
              <p>Toca el ícono de marcador arriba a la derecha para guardar la página actual.</p>
            </div>
          )}
          {bookmarks.map((b) => (
            <div key={b.id} className="note-card">
              <button className="note-main" onClick={() => onGoBookmark(b)}>
                <div className="note-head">
                  <Bookmark size={15} fill="currentColor" className="accent-ink" />
                  <span>{Math.round(b.percent * 100)}%</span>
                  <span className="faint">· {formatDate(b.createdAt)}</span>
                </div>
                <div className="note-text">{b.label}</div>
              </button>
              <button className="icon-btn" aria-label="Borrar marcador" onClick={() => removeBookmark(b.id)}>
                <Trash size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "notes" && (
        <div className="notes-list">
          {noteCount === 0 ? (
            <div className="notes-empty">
              <NotebookPen size={30} />
              <p>Mantén pulsado el texto y arrastra para resaltar, subrayar, poner en negrita o agregar una nota.</p>
            </div>
          ) : null}
          <div className="row notes-actions">
            <button className="btn btn-outline btn-sm" onClick={() => onEditNote(null)}>
              <Plus size={16} /> Nueva nota
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onOpenNotebook}>
              <NotebookText size={16} /> Cuaderno completo
            </button>
          </div>
          {notes.map((n) => {
            const tint = NOTE_TINTS[n.tint] ?? NOTE_TINTS.lemon;
            return (
              <div key={n.id} className="note-card sticky" style={{ ["--tint" as string]: tint.bg, ["--tint-ink" as string]: tint.ink }}>
                <button className="note-main" onClick={() => onEditNote(n)}>
                  <div className="note-head">
                    <StickyNote size={14} />
                    <span className="ellipsis">
                      Nota · {n.chapter !== undefined ? chapterTitle(n.chapter) : formatDate(n.updatedAt)}
                    </span>
                  </div>
                  <div className="note-text hand">{n.text}</div>
                </button>
                {n.chapter !== undefined && (
                  <button className="btn btn-ghost btn-sm" onClick={() => onGoNote(n)}>
                    Ir
                  </button>
                )}
                <button className="icon-btn" aria-label="Borrar nota" title="Borrar nota" onClick={() => deleteLooseNote(n)}>
                  <Trash size={18} />
                </button>
              </div>
            );
          })}
          {highlights.map((h) => (
            <div key={h.id} className="note-card" style={{ ["--hl" as string]: HIGHLIGHT_COLORS[h.color].dot }}>
              <button className="note-main" onClick={() => onGoHighlight(h)}>
                <div className="note-head">
                  <span className="hl-dot" />
                  <span className="ellipsis">
                    {markStyleInfo(h.style).noun} · {chapterTitle(h.chapter)}
                  </span>
                </div>
                <div className="note-text quote">
                  <MarkSample style={h.style} color={h.color}>
                    {h.text}
                  </MarkSample>
                </div>
                {h.note && <div className="note-note">📝 {h.note}</div>}
              </button>
              <button className="icon-btn" aria-label="Editar" title="Editar" onClick={() => onEditHighlight(h)}>
                <NotebookPen size={18} />
              </button>
              <button className="icon-btn" aria-label="Quitar marca" title="Quitar marca" onClick={() => discardHighlight(h)}>
                <Eraser size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
