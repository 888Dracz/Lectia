import { BookOpen, Quote, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { bookPostData, queuePost, useCommunity } from "../../community/store";
import { navigate } from "../../lib/router";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { Cover } from "../components/Cover";
import { Sheet } from "../components/Sheet";
import { HIGHLIGHT_COLORS } from "../reader/themes";
import { Stars } from "./parts";

type Target = { kind: "pick" } | { kind: "book"; bookId?: string } | { kind: "quote"; highlightId?: string };

const useShare = create<{ target: Target | null }>(() => ({ target: null }));

/** Abre la hoja para compartir en Novedades (un libro, una cita o elegir). */
export function openShare(target: Target = { kind: "pick" }) {
  if (!useCommunity.getState().profile) {
    toast("Crea tu perfil en Comunidad para compartir con tus amigos", {
      icon: "👋",
      action: { label: "Crear", run: () => navigate({ name: "community", tab: "feed" }) },
    });
    return;
  }
  useShare.setState({ target });
}

export function ShareHost() {
  const target = useShare((s) => s.target);
  return <ShareSheet target={target} onClose={() => useShare.setState({ target: null })} />;
}

function ShareSheet({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const books = useStore((s) => s.books);
  const highlights = useStore((s) => s.highlights);
  const [view, setView] = useState<Target>({ kind: "pick" });
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [withNote, setWithNote] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (target) {
      setView(target);
      setRating(0);
      setText("");
      setWithNote(true);
    }
  }, [target]);

  const bookList = useMemo(
    () => Object.values(books).sort((a, b) => (b.finishedAt ?? b.lastOpenedAt ?? b.addedAt) - (a.finishedAt ?? a.lastOpenedAt ?? a.addedAt)),
    [books]
  );
  const quoteList = useMemo(() => highlights.slice().sort((a, b) => b.createdAt - a.createdAt), [highlights]);

  const book = view.kind === "book" && view.bookId ? books[view.bookId] : undefined;
  const hl = view.kind === "quote" && view.highlightId ? highlights.find((h) => h.id === view.highlightId) : undefined;
  const hlBook = hl ? books[hl.bookId] : undefined;

  const publish = async () => {
    setSending(true);
    try {
      if (book) {
        queuePost("share_book", await bookPostData(book, { ...(rating ? { rating } : {}), ...(text.trim() ? { text: text.trim().slice(0, 280) } : {}) }));
      } else if (hl) {
        queuePost("share_quote", {
          quote: hl.text.slice(0, 1000),
          title: (hlBook?.title ?? "").slice(0, 200),
          author: (hlBook?.author ?? "").slice(0, 160),
          ...(withNote && hl.note ? { note: hl.note.slice(0, 280) } : {}),
        });
      }
      toast(useCommunity.getState().offline ? "Se publicará cuando tengas conexión" : "Publicado en Novedades", { tone: "success" });
      onClose();
    } finally {
      setSending(false);
    }
  };

  const title = view.kind === "pick" ? "Compartir en Novedades" : view.kind === "book" ? "Recomendar un libro" : "Compartir una cita";

  return (
    <Sheet open={!!target} onClose={onClose} title={title} height={view.kind === "pick" ? undefined : "85dvh"}>
      {view.kind === "pick" && (
        <div className="share-pick">
          <button className="share-option" onClick={() => setView({ kind: "book" })}>
            <BookOpen size={26} />
            <b>Un libro</b>
            <span className="faint">Recomiéndalo con estrellas y unas palabras</span>
          </button>
          <button className="share-option" onClick={() => setView({ kind: "quote" })}>
            <Quote size={26} />
            <b>Una cita o nota</b>
            <span className="faint">Elige uno de tus subrayados</span>
          </button>
          <p className="faint share-note">Solo tus amigos verán lo que compartes. Pueden darle me gusta, pero no hay comentarios.</p>
        </div>
      )}

      {view.kind === "book" && !book && (
        <div className="list">
          {bookList.length === 0 && <div className="list-item faint">Agrega libros a tu biblioteca para recomendarlos.</div>}
          {bookList.map((b) => (
            <button key={b.id} className="list-item" onClick={() => setView({ kind: "book", bookId: b.id })}>
              <span className="li-cover">
                <Cover book={b} />
              </span>
              <span className="li-main">
                <div className="li-title ellipsis">{b.title}</div>
                <div className="li-sub">{b.author || "Autor desconocido"}</div>
              </span>
            </button>
          ))}
        </div>
      )}

      {book && (
        <div className="share-form">
          <div className="share-book">
            <div className="share-book-cover">
              <Cover book={book} />
            </div>
            <div>
              <b className="display">{book.title}</b>
              <div className="muted">{book.author}</div>
            </div>
          </div>
          <div className="label">Tu calificación</div>
          <Stars value={rating} onChange={setRating} size={30} />
          <label className="label" htmlFor="share-text">
            ¿Por qué lo recomiendas? (opcional)
          </label>
          <textarea id="share-text" className="field" maxLength={280} value={text} placeholder="Me atrapó desde la primera página…" onChange={(e) => setText(e.target.value)} />
          <div className="pe-count faint">{text.length}/280</div>
          <p className="faint share-note">Se comparte el título, el autor y la portada. El archivo del libro nunca sale de tu teléfono.</p>
          <button className="btn btn-primary btn-block" disabled={sending} onClick={() => void publish()}>
            <Send size={18} /> Publicar
          </button>
        </div>
      )}

      {view.kind === "quote" && !hl && (
        <div className="share-quotes">
          {quoteList.length === 0 && (
            <p className="faint">Todavía no tienes subrayados. Mientras lees, selecciona un fragmento para subrayarlo y luego compártelo desde aquí.</p>
          )}
          {quoteList.map((h) => (
            <button key={h.id} className="share-quote" style={{ ["--hl" as string]: HIGHLIGHT_COLORS[h.color].dot }} onClick={() => setView({ kind: "quote", highlightId: h.id })}>
              <span className="share-quote-text">{h.text}</span>
              <span className="faint">{books[h.bookId]?.title ?? ""}</span>
            </button>
          ))}
        </div>
      )}

      {hl && (
        <div className="share-form">
          <blockquote className="hl-quote" style={{ ["--hl" as string]: HIGHLIGHT_COLORS[hl.color].dot }}>
            {hl.text.length > 1000 ? `${hl.text.slice(0, 1000)}…` : hl.text}
          </blockquote>
          <div className="faint">
            — {hlBook?.title}
            {hlBook?.author ? `, ${hlBook.author}` : ""}
          </div>
          {hl.note && (
            <label className="share-check">
              <input type="checkbox" checked={withNote} onChange={(e) => setWithNote(e.target.checked)} />
              <span>
                Incluir mi nota: <i>{hl.note}</i>
              </span>
            </label>
          )}
          <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={sending} onClick={() => void publish()}>
            <Send size={18} /> Publicar
          </button>
        </div>
      )}
    </Sheet>
  );
}
