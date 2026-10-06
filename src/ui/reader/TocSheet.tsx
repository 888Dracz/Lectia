import { Bookmark, Download, NotebookPen, Trash } from "lucide-react";
import { useMemo, useState } from "react";
import type { BookContent, BookMeta } from "../../books/types";
import { formatDate } from "../../lib/util";
import type { Bookmark as BookmarkT, Highlight } from "../../store/state";
import { useStore } from "../../store/store";
import { deliverFile } from "../../backup/backup";
import { Segmented } from "../components/controls";
import { Sheet } from "../components/Sheet";
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
}

export function TocSheet({ open, onClose, book, content, currentChapter, onGoChapter, onGoBookmark, onGoHighlight, onEditHighlight }: Props) {
  const [tab, setTab] = useState<"toc" | "marks" | "notes">("toc");
  const allBookmarks = useStore((s) => s.bookmarks);
  const allHighlights = useStore((s) => s.highlights);
  const removeBookmark = useStore((s) => s.removeBookmark);
  const bookmarks = useMemo(() => allBookmarks.filter((b) => b.bookId === book.id).sort((a, b) => a.percent - b.percent), [allBookmarks, book.id]);
  const highlights = useMemo(
    () => allHighlights.filter((h) => h.bookId === book.id).sort((a, b) => a.chapter - b.chapter || a.start - b.start),
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

  const exportNotes = async () => {
    const lines = [`# ${book.title}`, book.author ? `*${book.author}*` : "", "", `Exportado desde Campanita el ${formatDate(Date.now())}.`, ""];
    let lastChapter = -1;
    for (const h of highlights) {
      if (h.chapter !== lastChapter) {
        lines.push("", `## ${chapterTitle(h.chapter)}`, "");
        lastChapter = h.chapter;
      }
      lines.push(`> ${h.text.replace(/\n+/g, " ")}`);
      if (h.note) lines.push("", `📝 ${h.note}`);
      lines.push("");
    }
    if (bookmarks.length) {
      lines.push("", "## Marcadores", "");
      for (const b of bookmarks) lines.push(`- ${b.label} (${Math.round(b.percent * 100)}%)`);
    }
    const file = new File([lines.join("\n")], `${book.title} - notas.md`, { type: "text/markdown" });
    await deliverFile(file, true);
  };

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
              <p>Mantén pulsado el texto y arrastra para subrayar o agregar una nota.</p>
            </div>
          ) : (
            <button className="btn btn-outline btn-sm" style={{ alignSelf: "flex-start", marginBottom: 6 }} onClick={() => void exportNotes()}>
              <Download size={16} /> Exportar notas
            </button>
          )}
          {highlights.map((h) => (
            <div key={h.id} className="note-card" style={{ ["--hl" as string]: HIGHLIGHT_COLORS[h.color].dot }}>
              <button className="note-main" onClick={() => onGoHighlight(h)}>
                <div className="note-head">
                  <span className="hl-dot" />
                  <span className="ellipsis">{chapterTitle(h.chapter)}</span>
                </div>
                <div className="note-text quote">{h.text}</div>
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
