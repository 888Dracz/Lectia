import { Bookmark, NotebookPen, NotebookText, Trash } from "lucide-react";
import { useMemo, useState } from "react";
import type { BookContent, BookMeta } from "../../books/types";
import { formatDate } from "../../lib/util";
import { markStyleInfo } from "../../notes/marks";
import type { Bookmark as BookmarkT, Highlight } from "../../store/state";
import { useStore } from "../../store/store";
import { Segmented } from "../components/controls";
import { Sheet } from "../components/Sheet";
import { MarkSample } from "./Annotations";
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
}

export function TocSheet({ open, onClose, book, content, currentChapter, onGoChapter, onGoBookmark, onGoHighlight, onEditHighlight, onOpenNotebook }: Props) {
  const [tab, setTab] = useState<"toc" | "marks" | "notes">("toc");
  const allBookmarks = useStore((s) => s.bookmarks);
  const allHighlights = useStore((s) => s.highlights);
  const removeBookmark = useStore((s) => s.removeBookmark);
  const bookmarks = useMemo(
    () => allBookmarks.filter((b) => b.bookId === book.id && !b.discardedAt).sort((a, b) => a.percent - b.percent),
    [allBookmarks, book.id]
  );
  const highlights = useMemo(
    () => allHighlights.filter((h) => h.bookId === book.id && !h.discardedAt).sort((a, b) => a.chapter - b.chapter || a.start - b.start),
    [allHighlights, book.id]
  );
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
          { value: "notes", label: `Notas${highlights.length ? ` · ${highlights.length}` : ""}` },
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
          {highlights.length === 0 ? (
            <div className="notes-empty">
              <NotebookPen size={30} />
              <p>Mantén pulsado el texto y arrastra para resaltar, subrayar, poner en negrita o agregar una nota.</p>
            </div>
          ) : null}
          <button className="btn btn-outline btn-sm" style={{ alignSelf: "flex-start", marginBottom: 6 }} onClick={onOpenNotebook}>
            <NotebookText size={16} /> Abrir el cuaderno completo
          </button>
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
              <button className="icon-btn" aria-label="Editar" onClick={() => onEditHighlight(h)}>
                <NotebookPen size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
