// Lista por leer: los libros que vienen, en el orden que tú decidas
// (arrastrándolos), con deseos que aún no tienes, leídos y descartados.
import {
  ArchiveRestore,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpToLine,
  BookOpen,
  BookPlus,
  CircleCheck,
  Circle,
  Ellipsis,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { goBack } from "../../lib/router";
import { formatDate, formatRelative } from "../../lib/util";
import { estimateList, formatSpan, isActiveItem, minutesLeft, readingWpm } from "../../notes/readingList";
import type { ReadingListItem } from "../../store/state";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { Cover, GeneratedCover } from "../components/Cover";
import { Segmented } from "../components/controls";
import { Sheet } from "../components/Sheet";
import { openBook } from "../library/useOpenBook";
import { useDragReorder } from "./useDragReorder";

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m && h < 10 ? `${h} h ${m} min` : `${h} h`;
}

export function ItemCover({ item }: { item: ReadingListItem }) {
  const book = useStore((s) => (item.bookId ? s.books[item.bookId] : undefined));
  return book ? (
    <Cover book={book} />
  ) : (
    <div className="cover">
      <GeneratedCover title={item.title} author={item.author} />
    </div>
  );
}

export function ReadingListScreen() {
  const list = useStore((s) => s.readingList);
  const books = useStore((s) => s.books);
  const app = useStore((s) => s.app);
  const wpmHistory = useStore((s) => s.progress.wpmHistory);
  const moveReadingItem = useStore((s) => s.moveReadingItem);
  const [adding, setAdding] = useState(false);
  const [actionsFor, setActionsFor] = useState<ReadingListItem | null>(null);
  const [editing, setEditing] = useState<ReadingListItem | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [showDiscarded, setShowDiscarded] = useState(false);

  const active = useMemo(() => list.filter(isActiveItem), [list]);
  const done = useMemo(() => list.filter((i) => i.doneAt && !i.discardedAt).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)), [list]);
  const discarded = useMemo(() => list.filter((i) => i.discardedAt), [list]);
  const ids = useMemo(() => active.map((i) => i.id), [active]);
  const wpm = readingWpm(wpmHistory);
  const est = estimateList(active, books, wpm, app.dailyGoalMin);
  const { drag, handleProps, rowStyle, rowRef } = useDragReorder(ids, moveReadingItem);

  const discard = (item: ReadingListItem) => {
    useStore.getState().updateReadingItem(item.id, { discardedAt: Date.now() });
    toast(`“${item.title}” descartado`, {
      icon: "🗑️",
      action: { label: "Deshacer", run: () => useStore.getState().updateReadingItem(item.id, { discardedAt: undefined }) },
    }, 4500);
  };

  return (
    <div className="screen rl-screen">
      <header className="rl-bar">
        <button className="icon-btn" onClick={() => goBack({ name: "library" })} aria-label="Volver">
          <ArrowLeft size={23} />
        </button>
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={17} strokeWidth={2.6} /> Añadir
        </button>
      </header>

      <div className="rl-hero">
        <div className="eyebrow">Lo que viene</div>
        <h1 className="screen-title">Lista por leer</h1>
        {active.length > 0 ? (
          <p className="rl-hero-sub">
            <b>
              {active.length} {active.length === 1 ? "libro te espera" : "libros te esperan"}
            </b>
            {est.minutes > 0 && (
              <>
                {" "}
                · ≈ {formatMinutes(est.minutes)} de lectura{est.unknown ? ` (y ${est.unknown} sin calcular)` : ""}, unas <b>{formatSpan(est.days)}</b> a tu ritmo de{" "}
                {app.dailyGoalMin} min al día
              </>
            )}
          </p>
        ) : (
          <p className="rl-hero-sub">Ordena los libros que quieres leer: los de tu biblioteca y los que aún no tienes.</p>
        )}
      </div>

      {active.length === 0 ? (
        <div className="rl-empty">
          <div className="rl-empty-art" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <p>Tu lista está vacía. Agrega libros y acomódalos en el orden en que quieres leerlos.</p>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <BookPlus size={19} /> Armar mi lista
          </button>
        </div>
      ) : (
        <>
          {active.length > 1 && <p className="rl-tip faint">Mantén el asa ⠿ y arrastra para cambiar el orden.</p>}
          <ol className={`rl-list ${drag ? "dragging" : ""}`}>
            {active.map((item, i) => {
              const book = item.bookId ? books[item.bookId] : undefined;
              const min = minutesLeft(book, wpm);
              const pct = book?.location?.percent ?? 0;
              return (
                <li
                  key={item.id}
                  ref={rowRef(item.id)}
                  className={`rl-item ${i === 0 ? "next" : ""} ${drag?.id === item.id ? "lifted" : ""}`}
                  style={rowStyle(item.id)}
                >
                  <button className="rl-grip" aria-label={`Mover “${item.title}” (posición ${i + 1})`} {...handleProps(item.id)}>
                    <GripVertical size={20} />
                  </button>
                  <span className="rl-num" aria-hidden>
                    {i + 1}
                  </span>
                  <button className="rl-main" onClick={() => setActionsFor(item)}>
                    <span className="rl-cover">
                      <ItemCover item={item} />
                    </span>
                    <span className="rl-text">
                      {i === 0 && <span className="rl-next-badge">Siguiente</span>}
                      <span className="rl-title">{item.title}</span>
                      {item.author && <span className="rl-author">{item.author}</span>}
                      {item.note && <span className="rl-note hand">{item.note}</span>}
                      <span className="rl-tags">
                        {!book && <span className="rl-tag wish">Aún no lo tienes</span>}
                        {book && pct > 0 && <span className="rl-tag">{Math.round(pct * 100)}% leído</span>}
                        {min !== null && <span className="rl-tag">≈ {formatMinutes(min)}</span>}
                      </span>
                    </span>
                  </button>
                  <button className="icon-btn rl-more" aria-label="Opciones" onClick={() => setActionsFor(item)}>
                    <Ellipsis size={20} />
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {done.length > 0 && (
        <section className="rl-section">
          <button className="rl-section-head" onClick={() => setShowDone((v) => !v)}>
            <CircleCheck size={17} /> Leídos de la lista <span className="count">{done.length}</span>
            <span className="spacer" />
            <span className="faint">{showDone ? "Ocultar" : "Ver"}</span>
          </button>
          {showDone && (
            <ul className="rl-small">
              {done.map((item) => (
                <li key={item.id} className="rl-small-item done">
                  <span className="rl-small-cover">
                    <ItemCover item={item} />
                  </span>
                  <span className="rl-small-text">
                    <s>{item.title}</s>
                    <span className="faint">Terminado el {formatDate(item.doneAt!)}</span>
                  </span>
                  <button className="icon-btn" aria-label="Volver a la lista" onClick={() => useStore.getState().updateReadingItem(item.id, { doneAt: undefined })}>
                    <ArchiveRestore size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {discarded.length > 0 && (
        <section className="rl-section">
          <button className="rl-section-head" onClick={() => setShowDiscarded((v) => !v)}>
            <Trash2 size={16} /> Descartados <span className="count">{discarded.length}</span>
            <span className="spacer" />
            <span className="faint">{showDiscarded ? "Ocultar" : "Ver"}</span>
          </button>
          {showDiscarded && (
            <ul className="rl-small">
              {discarded.map((item) => (
                <li key={item.id} className="rl-small-item">
                  <span className="rl-small-cover">
                    <ItemCover item={item} />
                  </span>
                  <span className="rl-small-text">
                    <span>{item.title}</span>
                    <span className="faint">Descartado {formatRelative(item.discardedAt!)}</span>
                  </span>
                  <button className="icon-btn" aria-label="Recuperar" onClick={() => useStore.getState().updateReadingItem(item.id, { discardedAt: undefined })}>
                    <ArchiveRestore size={18} />
                  </button>
                  <button className="icon-btn" aria-label="Quitar para siempre" onClick={() => useStore.getState().removeReadingItem(item.id)}>
                    <X size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <AddSheet open={adding} onClose={() => setAdding(false)} />
      <ItemActions
        item={actionsFor}
        position={actionsFor ? ids.indexOf(actionsFor.id) : -1}
        total={ids.length}
        onClose={() => setActionsFor(null)}
        onEdit={(i) => {
          setActionsFor(null);
          setEditing(i);
        }}
        onDiscard={(i) => {
          setActionsFor(null);
          discard(i);
        }}
      />
      <EditSheet item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ItemActions({
  item,
  position,
  total,
  onClose,
  onEdit,
  onDiscard,
}: {
  item: ReadingListItem | null;
  position: number;
  total: number;
  onClose: () => void;
  onEdit: (i: ReadingListItem) => void;
  onDiscard: (i: ReadingListItem) => void;
}) {
  const book = useStore((s) => (item?.bookId ? s.books[item.bookId] : undefined));
  const store = useStore.getState();
  return (
    <Sheet open={!!item} onClose={onClose}>
      {item && (
        <>
          <div className="rl-sheet-head">
            <span className="rl-cover">
              <ItemCover item={item} />
            </span>
            <div>
              <div className="eyebrow">#{position + 1} de tu lista</div>
              <h3 className="display">{item.title}</h3>
              {item.author && <div className="muted">{item.author}</div>}
              {item.note && <p className="hand rl-sheet-note">{item.note}</p>}
            </div>
          </div>
          {book && (
            <button
              className="btn btn-primary btn-block"
              onClick={() => {
                onClose();
                openBook(book.id);
              }}
            >
              <BookOpen size={19} /> {book.status === "reading" ? "Seguir leyendo" : "Empezar a leer"}
            </button>
          )}
          <div className="list" style={{ marginTop: 14 }}>
            {position > 0 && (
              <button
                className="list-item"
                onClick={() => {
                  store.moveReadingItem(item.id, 0);
                  onClose();
                }}
              >
                <span className="li-icon">
                  <ArrowUpToLine size={18} />
                </span>
                <span className="li-main li-title">Leerlo primero</span>
              </button>
            )}
            {position < total - 1 && (
              <button
                className="list-item"
                onClick={() => {
                  store.moveReadingItem(item.id, total - 1);
                  onClose();
                }}
              >
                <span className="li-icon">
                  <ArrowDownToLine size={18} />
                </span>
                <span className="li-main li-title">Mandarlo al final</span>
              </button>
            )}
            <button className="list-item" onClick={() => onEdit(item)}>
              <span className="li-icon">
                <Pencil size={18} />
              </span>
              <span className="li-main li-title">{book ? "Escribir por qué quiero leerlo" : "Editar título, autor y nota"}</span>
            </button>
            <button
              className="list-item"
              onClick={() => {
                onClose();
                if (book) store.setFinished(book.id, true);
                else store.updateReadingItem(item.id, { doneAt: Date.now() });
              }}
            >
              <span className="li-icon" style={{ color: "var(--green)", background: "rgba(79,214,138,.14)" }}>
                <CircleCheck size={18} />
              </span>
              <span className="li-main li-title">Ya lo leí</span>
            </button>
            <button className="list-item" onClick={() => onDiscard(item)}>
              <span className="li-icon" style={{ color: "var(--red)", background: "rgba(255,107,107,.14)" }}>
                <Trash2 size={18} />
              </span>
              <span className="li-main">
                <div className="li-title" style={{ color: "var(--red)" }}>
                  Descartar
                </div>
                <div className="li-sub">Ya no me interesa (se puede recuperar)</div>
              </span>
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function EditSheet({ item, onClose }: { item: ReadingListItem | null; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [note, setNote] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  if (item && item.id !== lastId) {
    setLastId(item.id);
    setTitle(item.title);
    setAuthor(item.author);
    setNote(item.note);
  }
  const save = () => {
    if (item) {
      useStore.getState().updateReadingItem(item.id, {
        ...(item.bookId ? {} : { title: title.trim() || item.title, author: author.trim() }),
        note: note.trim(),
      });
    }
    setLastId(null);
    onClose();
  };
  return (
    <Sheet open={!!item} onClose={save} title={item?.bookId ? "¿Por qué quiero leerlo?" : "Editar"}>
      {item && !item.bookId && (
        <>
          <label className="label" htmlFor="rl-title">
            Título
          </label>
          <input id="rl-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="label" htmlFor="rl-author">
            Autor
          </label>
          <input id="rl-author" className="field" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </>
      )}
      <label className="label" htmlFor="rl-note">
        Nota
      </label>
      <textarea
        id="rl-note"
        className="field hand"
        value={note}
        placeholder="Me lo recomendó… / Para leer en vacaciones…"
        onChange={(e) => setNote(e.target.value)}
      />
      <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={save}>
        Guardar
      </button>
    </Sheet>
  );
}

/** Añadir libros a la lista: de la biblioteca o uno que aún no tienes. */
export function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const books = useStore((s) => s.books);
  const list = useStore((s) => s.readingList);
  const [tab, setTab] = useState<"library" | "wish">("library");
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [note, setNote] = useState("");

  const inList = useMemo(() => new Set(list.filter(isActiveItem).map((i) => i.bookId).filter(Boolean)), [list]);
  const candidates = useMemo(
    () =>
      Object.values(books)
        .filter((b) => !inList.has(b.id) && b.status !== "finished")
        .sort((a, b) => (a.status === "unread" ? 0 : 1) - (b.status === "unread" ? 0 : 1) || b.addedAt - a.addedAt),
    [books, inList]
  );

  const close = () => {
    setPicked([]);
    setTitle("");
    setAuthor("");
    setNote("");
    onClose();
  };

  const addPicked = () => {
    const store = useStore.getState();
    let n = 0;
    for (const id of picked) {
      const b = books[id];
      if (b && store.addToReadingList({ bookId: id, title: b.title, author: b.author })) n++;
    }
    if (n) toast(n === 1 ? "Añadido a tu lista" : `${n} libros añadidos a tu lista`, { icon: "🗒️", tone: "success" });
    close();
  };

  const addWish = () => {
    if (!title.trim()) return;
    useStore.getState().addToReadingList({ title, author, note });
    toast(`“${title.trim()}” está en tu lista`, { icon: "🗒️", tone: "success" });
    close();
  };

  return (
    <Sheet open={open} onClose={close} title="Añadir a la lista" height="80dvh">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "library", label: "De mi biblioteca" },
          { value: "wish", label: "Uno que no tengo" },
        ]}
      />
      {tab === "library" ? (
        <>
          {candidates.length === 0 ? (
            <p className="faint" style={{ padding: "26px 6px", textAlign: "center" }}>
              Todos tus libros pendientes ya están en la lista. Prueba con “Uno que no tengo”.
            </p>
          ) : (
            <div className="list" style={{ marginTop: 14 }}>
              {candidates.map((b) => {
                const on = picked.includes(b.id);
                return (
                  <button key={b.id} className="list-item" onClick={() => setPicked((p) => (on ? p.filter((x) => x !== b.id) : [...p, b.id]))}>
                    <span className="li-cover">
                      <Cover book={b} />
                    </span>
                    <span className="li-main">
                      <div className="li-title ellipsis">{b.title}</div>
                      <div className="li-sub ellipsis">
                        {b.author || "Autor desconocido"}
                        {b.status === "reading" ? ` · ${Math.round((b.location?.percent ?? 0) * 100)}%` : ""}
                      </div>
                    </span>
                    {on ? <CircleCheck size={22} color="var(--accent)" /> : <Circle size={22} color="var(--text-3)" />}
                  </button>
                );
              })}
            </div>
          )}
          <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={!picked.length} onClick={addPicked}>
            {picked.length ? `Añadir ${picked.length === 1 ? "1 libro" : `${picked.length} libros`}` : "Elige libros"}
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addWish();
          }}
        >
          <label className="label" htmlFor="wish-title">
            Título
          </label>
          <input id="wish-title" className="field" value={title} autoFocus placeholder="Ej.: Rayuela" onChange={(e) => setTitle(e.target.value)} />
          <label className="label" htmlFor="wish-author">
            Autor (opcional)
          </label>
          <input id="wish-author" className="field" value={author} placeholder="Ej.: Julio Cortázar" onChange={(e) => setAuthor(e.target.value)} />
          <label className="label" htmlFor="wish-note">
            Nota (opcional)
          </label>
          <textarea id="wish-note" className="field hand" value={note} placeholder="¿Quién te lo recomendó? ¿Por qué quieres leerlo?" onChange={(e) => setNote(e.target.value)} />
          <p className="faint small-print" style={{ marginTop: 10 }}>
            Cuando agregues el archivo de este libro a tu biblioteca, se vinculará solo.
          </p>
          <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 12 }} disabled={!title.trim()}>
            <Plus size={18} /> Añadir a la lista
          </button>
        </form>
      )}
    </Sheet>
  );
}
