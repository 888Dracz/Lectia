// Pestaña "Cuadernos": todos los cuadernos de notas (uno por libro) y la
// frase del día, rescatada de lo que fuiste subrayando.
import { Image as ImageIcon, NotebookText, Plus, Quote } from "lucide-react";
import { useMemo, useState } from "react";
import { navigate } from "../../lib/router";
import { dayKey, formatRelative } from "../../lib/util";
import { entryCounts, quoteOfTheDay, resolveNotebook } from "../../notes/notebook";
import { useStore } from "../../store/store";
import { Cover } from "../components/Cover";
import { Sheet } from "../components/Sheet";
import { MarkSample } from "../reader/Annotations";
import { NotebookCoverArt } from "./NotebookSheets";
import { QuoteCardSheet, type CardSource } from "./QuoteCardSheet";

export function NotebooksScreen() {
  const books = useStore((s) => s.books);
  const notebooks = useStore((s) => s.notebooks);
  const highlights = useStore((s) => s.highlights);
  const bookmarks = useStore((s) => s.bookmarks);
  const drawings = useStore((s) => s.drawings);
  const clips = useStore((s) => s.clips);
  const looseNotes = useStore((s) => s.looseNotes);
  const [picker, setPicker] = useState(false);
  const [card, setCard] = useState<CardSource | null>(null);

  const list = useMemo(() => {
    const counts = entryCounts({ highlights, bookmarks, drawings, clips, looseNotes });
    const last = new Map<string, number>();
    const touch = (x: { bookId: string; createdAt: number; discardedAt?: number }) => {
      if (!x.discardedAt) last.set(x.bookId, Math.max(last.get(x.bookId) ?? 0, x.createdAt));
    };
    [highlights, bookmarks, drawings, clips, looseNotes].forEach((arr) => arr.forEach(touch));
    const ids = new Set([...counts.keys(), ...Object.keys(notebooks)]);
    return [...ids]
      .filter((id) => books[id] || notebooks[id])
      .map((id) => {
        const saved = notebooks[id];
        const book = books[id];
        const nb = resolveNotebook(saved, id, book ?? { title: saved?.bookTitle ?? "", author: saved?.bookAuthor ?? "" });
        return { id, nb, book, count: counts.get(id) ?? 0, last: Math.max(last.get(id) ?? 0, saved?.updatedAt ?? 0) };
      })
      .sort((a, b) => b.last - a.last);
  }, [books, notebooks, highlights, bookmarks, drawings, clips, looseNotes]);

  const quote = useMemo(() => {
    const known = highlights.filter((h) => books[h.bookId] || notebooks[h.bookId]);
    return quoteOfTheDay(known, dayKey());
  }, [highlights, books, notebooks]);
  const quoteBook = quote ? books[quote.bookId] ?? { title: notebooks[quote.bookId]?.bookTitle ?? "", author: notebooks[quote.bookId]?.bookAuthor ?? "" } : null;

  const without = useMemo(() => Object.values(books).filter((b) => !list.some((x) => x.id === b.id)), [books, list]);
  const total = list.reduce((a, x) => a + x.count, 0);

  return (
    <div className="screen notebooks">
      <header className="screen-header">
        <div>
          <div className="eyebrow">{total ? `${total} ${total === 1 ? "nota" : "notas"} guardadas` : "Tus notas de lectura"}</div>
          <h1 className="screen-title">Cuadernos</h1>
        </div>
        {Object.keys(books).length > 0 && (
          <button className="icon-btn accent" aria-label="Nuevo cuaderno" onClick={() => setPicker(true)}>
            <Plus size={22} strokeWidth={2.4} />
          </button>
        )}
      </header>

      {quote && quoteBook && (
        <div className="qotd">
          <div className="qotd-head">
            <Quote size={16} /> Frase para hoy
          </div>
          <button className="qotd-text" onClick={() => navigate({ name: "notebook", bookId: quote.bookId })}>
            <MarkSample style={quote.style} color={quote.color}>
              {quote.text}
            </MarkSample>
          </button>
          <div className="qotd-foot">
            <span className="ellipsis">
              {quoteBook.title}
              {quoteBook.author ? ` · ${quoteBook.author}` : ""}
            </span>
            <button className="btn btn-sm btn-ghost" onClick={() => setCard({ text: quote.text, title: quoteBook.title, author: quoteBook.author, highlight: quote })}>
              <ImageIcon size={15} /> Tarjeta
            </button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="empty">
          <div className="nb-empty-stack" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <h2>Aquí vivirán tus cuadernos</h2>
          <p>
            Cada libro tiene su propio cuaderno de notas, con el nombre que tú quieras. Lo que <b>resaltes</b>, <b>subrayes</b>, pongas en{" "}
            <b>negrita</b>, <b>dibujes a mano</b> o <b>recortes</b> mientras lees se guarda ahí, ordenado según cómo lo hiciste.
          </p>
          {Object.keys(books).length > 0 && (
            <div className="actions">
              <button className="btn btn-primary" onClick={() => setPicker(true)}>
                <NotebookText size={19} /> Empezar un cuaderno
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="nb-shelf">
          {list.map((x) => (
            <button key={x.id} className="nb-shelf-item" onClick={() => navigate({ name: "notebook", bookId: x.id })}>
              <NotebookCoverArt nb={x.nb} />
              <div className="nb-shelf-meta">
                <div className="nb-shelf-book ellipsis">{x.book?.title ?? x.nb.bookTitle}</div>
                <div className="faint nb-shelf-sub">
                  {x.count ? `${x.count} ${x.count === 1 ? "entrada" : "entradas"}` : "En blanco"}
                  {x.last ? ` · ${formatRelative(x.last)}` : ""}
                  {!x.book && " · libro eliminado"}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Sheet open={picker} onClose={() => setPicker(false)} title="Nuevo cuaderno" height="70dvh">
        {without.length === 0 ? (
          <p className="faint" style={{ padding: "20px 4px" }}>
            Todos tus libros ya tienen cuaderno.
          </p>
        ) : (
          <div className="list">
            {without.map((b) => (
              <button
                key={b.id}
                className="list-item"
                onClick={() => {
                  setPicker(false);
                  useStore.getState().setNotebook(b.id, {});
                  navigate({ name: "notebook", bookId: b.id });
                }}
              >
                <span className="li-cover">
                  <Cover book={b} />
                </span>
                <span className="li-main">
                  <div className="li-title ellipsis">{b.title}</div>
                  <div className="li-sub ellipsis">{b.author || "Autor desconocido"}</div>
                </span>
              </button>
            ))}
          </div>
        )}
      </Sheet>
      <QuoteCardSheet source={card} onClose={() => setCard(null)} />
    </div>
  );
}
