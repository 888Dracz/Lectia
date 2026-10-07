import {
  ArrowDownUp,
  BookOpen,
  Check,
  Flame,
  Grid2x2,
  Heart,
  LayoutList,
  Library,
  Ellipsis,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { FORMAT_LABEL, type BookMeta } from "../../books/types";
import { navigate } from "../../lib/router";
import { fold } from "../../lib/text";
import { dayKey, formatRelative, greeting } from "../../lib/util";
import { computeStreak, levelFromXp } from "../../store/gamification";
import type { LibrarySort, LibraryView } from "../../store/state";
import { useStore } from "../../store/store";
import { Cover } from "../components/Cover";
import { Bar, Ring } from "../components/controls";
import { promptDialog } from "../components/Dialog";
import { Sheet } from "../components/Sheet";
import { BookActionsSheet } from "./BookSheets";
import { addWelcomeBook, BOOK_ACCEPT, pickFiles, runImport } from "./importFlow";
import { formatRemaining, openBook, remainingMinutes } from "./useOpenBook";

type Filter = "all" | "reading" | "unread" | "finished" | "fav" | string;

const SORT_LABEL: Record<LibrarySort, string> = {
  recent: "Leídos recientemente",
  added: "Agregados recientemente",
  title: "Título (A–Z)",
  author: "Autor (A–Z)",
  progress: "Avance",
};

function sortBooks(books: BookMeta[], sort: LibrarySort): BookMeta[] {
  const arr = books.slice();
  switch (sort) {
    case "recent":
      return arr.sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt));
    case "added":
      return arr.sort((a, b) => b.addedAt - a.addedAt);
    case "title":
      return arr.sort((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" }));
    case "author":
      return arr.sort((a, b) => (a.author || "~").localeCompare(b.author || "~", "es", { sensitivity: "base" }));
    case "progress":
      return arr.sort((a, b) => (b.location?.percent ?? 0) - (a.location?.percent ?? 0));
  }
}

export function LibraryScreen() {
  const books = useStore((s) => s.books);
  const collections = useStore((s) => s.collections);
  const app = useStore((s) => s.app);
  const progress = useStore((s) => s.progress);
  const setApp = useStore((s) => s.setApp);
  const createCollection = useStore((s) => s.createCollection);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const all = useMemo(() => Object.values(books), [books]);
  const current = useMemo(
    () =>
      all
        .filter((b) => b.status === "reading" && b.location)
        .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))[0],
    [all]
  );

  const counts = useMemo(
    () => ({
      all: all.length,
      reading: all.filter((b) => b.status === "reading").length,
      unread: all.filter((b) => b.status === "unread").length,
      finished: all.filter((b) => b.status === "finished").length,
      fav: all.filter((b) => b.favorite).length,
    }),
    [all]
  );

  const visible = useMemo(() => {
    let list = all;
    if (filter === "reading" || filter === "unread" || filter === "finished") list = list.filter((b) => b.status === filter);
    else if (filter === "fav") list = list.filter((b) => b.favorite);
    else if (filter !== "all") list = list.filter((b) => b.collections.includes(filter));
    const q = fold(query.trim());
    if (q) list = list.filter((b) => fold(`${b.title} ${b.author}`).includes(q));
    return sortBooks(list, app.librarySort);
  }, [all, filter, query, app.librarySort]);

  const streak = computeStreak(progress.days);
  const today = progress.days[dayKey()];
  const todayMin = Math.floor((today?.ms ?? 0) / 60000);
  const lvl = levelFromXp(progress.xp);

  const oldestAdded = all.reduce((m, b) => Math.min(m, b.addedAt), Date.now());
  const showBackupNag =
    all.length >= 3 &&
    Date.now() - oldestAdded > 3 * 86400000 &&
    (!app.lastBackupAt || Date.now() - app.lastBackupAt > 14 * 86400000) &&
    (!app.backupNagDismissedAt || Date.now() - app.backupNagDismissedAt > 7 * 86400000);

  const addBooks = () => pickFiles((files) => void runImport(files), BOOK_ACCEPT);

  const newShelf = async () => {
    const name = await promptDialog("Nueva estantería", "", "Ej.: Novelas, Estudio, Poesía…", "Crear");
    if (name?.trim()) setFilter(createCollection(name.trim(), pickEmoji(name)));
  };

  return (
    <div
      className="screen library"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void runImport(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="lib-header">
        {searching ? (
          <div className="lib-search">
            <Search size={18} className="faint" />
            <input
              autoFocus
              placeholder="Buscar por título o autor"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar en la biblioteca"
            />
            <button
              className="icon-btn"
              aria-label="Cerrar búsqueda"
              onClick={() => {
                setQuery("");
                setSearching(false);
              }}
            >
              <X size={20} />
            </button>
          </div>
        ) : (
          <>
            <div>
              <div className="lib-greeting">{greeting()} ✨</div>
              <h1 className="screen-title">Tu biblioteca</h1>
            </div>
            <div className="row" style={{ gap: 6 }}>
              {all.length > 0 && (
                <button className="icon-btn filled" aria-label="Buscar" onClick={() => setSearching(true)}>
                  <Search size={20} />
                </button>
              )}
              <button className="icon-btn accent" aria-label="Agregar libros" onClick={addBooks}>
                <Plus size={22} strokeWidth={2.4} />
              </button>
            </div>
          </>
        )}
      </header>

      {all.length > 0 && !searching && (
        <div className="lib-stats">
          <button className="stat-pill" onClick={() => navigate({ name: "progress" })}>
            <Flame size={17} className={streak.todayDone ? "flame on" : "flame"} />
            <b>{streak.current}</b>
            <span>{streak.current === 1 ? "día" : "días"}</span>
          </button>
          <button className="stat-pill" onClick={() => navigate({ name: "progress" })}>
            <Ring value={todayMin / app.dailyGoalMin} size={22} stroke={3.5} />
            <b>{todayMin}</b>
            <span>/ {app.dailyGoalMin} min</span>
          </button>
          <button className="stat-pill" onClick={() => navigate({ name: "progress" })}>
            <Sparkles size={16} className="spark" />
            <b>Nv {lvl.level}</b>
            <span className="ellipsis">{lvl.rank.name}</span>
          </button>
        </div>
      )}

      {current && !searching && filter === "all" && <ContinueCard book={current} />}

      {showBackupNag && !searching && (
        <div className="nag">
          <ShieldCheck size={22} />
          <div className="nag-text">
            <b>Protege tu biblioteca</b>
            <span>{app.lastBackupAt ? `Último respaldo ${formatRelative(app.lastBackupAt)}` : "Aún no has hecho un respaldo"}</span>
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => navigate({ name: "settings" })}>
            Respaldar
          </button>
          <button className="icon-btn" aria-label="Más tarde" onClick={() => setApp({ backupNagDismissedAt: Date.now() })}>
            <X size={18} />
          </button>
        </div>
      )}

      {all.length === 0 ? (
        <EmptyLibrary onAdd={addBooks} />
      ) : (
        <>
          <div className="chips lib-chips">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="Todos" count={counts.all} />
            <FilterChip active={filter === "reading"} onClick={() => setFilter("reading")} label="Leyendo" count={counts.reading} />
            <FilterChip active={filter === "unread"} onClick={() => setFilter("unread")} label="Por leer" count={counts.unread} />
            <FilterChip active={filter === "finished"} onClick={() => setFilter("finished")} label="Terminados" count={counts.finished} />
            <FilterChip active={filter === "fav"} onClick={() => setFilter("fav")} label={<><Heart size={14} /> Favoritos</>} count={counts.fav} />
            {collections.map((c) => (
              <FilterChip
                key={c.id}
                active={filter === c.id}
                onClick={() => setFilter(c.id)}
                label={`${c.emoji} ${c.name}`}
                count={all.filter((b) => b.collections.includes(c.id)).length}
              />
            ))}
            <button className="chip dashed" onClick={newShelf}>
              <Plus size={15} /> Estantería
            </button>
          </div>

          <div className="lib-toolbar">
            <span className="faint">
              {visible.length} {visible.length === 1 ? "libro" : "libros"}
            </span>
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => setSortOpen(true)}>
              <ArrowDownUp size={16} /> {SORT_LABEL[app.librarySort].split(" ")[0]}
            </button>
            <ViewToggle value={app.libraryView} onChange={(v) => setApp({ libraryView: v })} />
          </div>

          {visible.length === 0 ? (
            <div className="empty small">
              <p>{query ? "Ningún libro coincide con tu búsqueda." : "No hay libros aquí todavía."}</p>
              {filter.startsWith("col") && <p className="faint" style={{ marginTop: 6 }}>Mantén pulsado un libro → “Estanterías” para agregarlo.</p>}
            </div>
          ) : app.libraryView === "list" ? (
            <div className="book-list">
              {visible.map((b) => (
                <BookRow key={b.id} book={b} onMore={() => setActionsFor(b.id)} />
              ))}
            </div>
          ) : app.libraryView === "shelf" ? (
            <Shelves books={visible} onMore={setActionsFor} />
          ) : (
            <div className="book-grid">
              {visible.map((b) => (
                <BookTile key={b.id} book={b} onMore={() => setActionsFor(b.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {dragOver && (
        <div className="drop-zone">
          <BookOpen size={40} />
          <b>Suelta aquí tus libros</b>
        </div>
      )}

      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title="Ordenar por">
        <div className="list">
          {(Object.keys(SORT_LABEL) as LibrarySort[]).map((k) => (
            <button
              key={k}
              className="list-item"
              onClick={() => {
                setApp({ librarySort: k });
                setSortOpen(false);
              }}
            >
              <span className="li-main li-title">{SORT_LABEL[k]}</span>
              {app.librarySort === k && <Check size={20} color="var(--accent)" />}
            </button>
          ))}
        </div>
      </Sheet>

      <BookActionsSheet bookId={actionsFor} onClose={() => setActionsFor(null)} />
    </div>
  );
}

function pickEmoji(name: string): string {
  const n = fold(name);
  const map: [RegExp, string][] = [
    [/novela|ficcion|cuento/, "📕"],
    [/poes|poema|verso/, "🪶"],
    [/estudi|universidad|clase|curso|apunte/, "🎓"],
    [/trabaj|negocio|empresa/, "💼"],
    [/historia/, "🏛️"],
    [/ciencia|fisica|quimica|biolog/, "🔬"],
    [/comic|manga/, "💥"],
    [/infantil|nino|ninos/, "🧸"],
    [/fantas|magia/, "🪄"],
    [/terror|miedo/, "🕯️"],
    [/amor|romance/, "💌"],
    [/filosof/, "🦉"],
    [/cocina|receta/, "🍲"],
    [/espiritu|religi|biblia/, "🕊️"],
    [/autoayuda|crecimiento|habito/, "🌱"],
  ];
  return map.find(([re]) => re.test(n))?.[1] ?? "📚";
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: ReactNode; count: number }) {
  return (
    <button className={`chip ${active ? "active" : ""}`} onClick={onClick}>
      {label}
      <span className="count">{count}</span>
    </button>
  );
}

function ViewToggle({ value, onChange }: { value: LibraryView; onChange: (v: LibraryView) => void }) {
  const next: Record<LibraryView, LibraryView> = { grid: "shelf", shelf: "list", list: "grid" };
  const icon = value === "grid" ? <Grid2x2 size={19} /> : value === "shelf" ? <Library size={19} /> : <LayoutList size={19} />;
  const label = value === "grid" ? "Cuadrícula" : value === "shelf" ? "Estantes" : "Lista";
  return (
    <button className="btn btn-ghost btn-sm" onClick={() => onChange(next[value])} aria-label={`Vista: ${label}`}>
      {icon}
    </button>
  );
}

/** Pulsación larga (o clic derecho) para abrir el menú de un libro. */
function useLongPress(onLong: () => void, onClick: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(15);
        onLong();
      }, 480);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clear();
      if (!fired.current) {
        fired.current = true;
        onLong();
      }
    },
    onClick: () => {
      if (!fired.current) onClick();
    },
  };
}

function BookTile({ book, onMore }: { book: BookMeta; onMore: () => void }) {
  const press = useLongPress(onMore, () => openBook(book.id));
  const pct = book.location?.percent ?? 0;
  return (
    <div className="book-tile">
      <button className="tile-cover" {...press} aria-label={`Abrir ${book.title}`}>
        <Cover book={book} />
        <span className="fmt-badge">{FORMAT_LABEL[book.format]}</span>
        {book.status === "finished" && (
          <span className="done-badge" aria-label="Terminado">
            <Check size={13} strokeWidth={3} />
          </span>
        )}
        {book.favorite && <Heart className="fav-badge" size={16} fill="currentColor" />}
        {book.status === "unread" && <span className="new-dot" aria-label="Sin leer" />}
      </button>
      {book.status === "reading" && <Bar value={pct} className="tile-bar" />}
      <div className="tile-meta">
        <div className="tile-text">
          <div className="tile-title">{book.title}</div>
          <div className="tile-author">{book.author || (book.status === "reading" ? `${Math.round(pct * 100)}%` : FORMAT_LABEL[book.format])}</div>
        </div>
        <button className="tile-more" aria-label="Opciones" onClick={onMore}>
          <Ellipsis size={18} />
        </button>
      </div>
    </div>
  );
}

function BookRow({ book, onMore }: { book: BookMeta; onMore: () => void }) {
  const press = useLongPress(onMore, () => openBook(book.id));
  const pct = book.location?.percent ?? 0;
  return (
    <div className="book-row">
      <button className="row-main" {...press}>
        <div className="row-cover">
          <Cover book={book} />
        </div>
        <div className="row-text">
          <div className="row-title">{book.title}</div>
          <div className="row-author">{book.author || "Autor desconocido"}</div>
          <div className="row-foot">
            <span className="fmt-chip">{FORMAT_LABEL[book.format]}</span>
            {book.status === "finished" ? (
              <span className="faint">Terminado ✓</span>
            ) : book.status === "reading" ? (
              <>
                <Bar value={pct} className="row-bar" />
                <span className="faint pct">{Math.round(pct * 100)}%</span>
              </>
            ) : (
              <span className="faint">Sin empezar</span>
            )}
          </div>
        </div>
      </button>
      <button className="icon-btn" aria-label="Opciones" onClick={onMore}>
        <Ellipsis size={20} />
      </button>
    </div>
  );
}

function Shelves({ books, onMore }: { books: BookMeta[]; onMore: (id: string) => void }) {
  const rows: BookMeta[][] = [];
  for (let i = 0; i < books.length; i += 3) rows.push(books.slice(i, i + 3));
  return (
    <div className="shelves">
      {rows.map((row, i) => (
        <div className="shelf" key={i}>
          <div className="shelf-books">
            {row.map((b) => (
              <ShelfBook key={b.id} book={b} onMore={() => onMore(b.id)} />
            ))}
          </div>
          <div className="shelf-plank" />
        </div>
      ))}
    </div>
  );
}

function ShelfBook({ book, onMore }: { book: BookMeta; onMore: () => void }) {
  const press = useLongPress(onMore, () => openBook(book.id));
  return (
    <button className="shelf-book" {...press} aria-label={`Abrir ${book.title}`}>
      <Cover book={book} />
      {book.status === "reading" && (
        <span className="shelf-pct">{Math.round((book.location?.percent ?? 0) * 100)}%</span>
      )}
    </button>
  );
}

function ContinueCard({ book }: { book: BookMeta }) {
  const pct = book.location?.percent ?? 0;
  const remaining = formatRemaining(remainingMinutes(book.wordCount, pct));
  return (
    <button className="continue" onClick={() => openBook(book.id)}>
      <div className="continue-bg">
        <Cover book={book} />
      </div>
      <div className="continue-cover">
        <Cover book={book} />
      </div>
      <div className="continue-info">
        <div className="eyebrow accent">Continuar leyendo</div>
        <div className="continue-title">{book.title}</div>
        {book.author && <div className="continue-author">{book.author}</div>}
        <div className="continue-progress">
          <Bar value={pct} />
          <span>{Math.round(pct * 100)}%</span>
        </div>
        <div className="continue-foot">
          <span className="faint">{remaining || `Abierto ${formatRelative(book.lastOpenedAt ?? book.addedAt)}`}</span>
          <span className="play">
            <Play size={16} fill="currentColor" />
          </span>
        </div>
      </div>
    </button>
  );
}

function EmptyLibrary({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="empty">
      <div className="empty-art">
        <img src={`${import.meta.env.BASE_URL}icon-512.png`} alt="" className="empty-icon" />
        <span className="twinkle t1">✦</span>
        <span className="twinkle t2">✧</span>
        <span className="twinkle t3">✦</span>
      </div>
      <h2>Tu biblioteca está vacía</h2>
      <p>Agrega libros en PDF, EPUB, Word, TXT, FB2, Markdown, HTML o cómics CBZ. Se guardan solo en este dispositivo.</p>
      <div className="actions">
        <button className="btn btn-primary" onClick={onAdd}>
          <Plus size={20} /> Agregar libros
        </button>
        <button className="btn btn-outline" onClick={() => void addWelcomeBook()}>
          <Sparkles size={18} /> Ver la guía de bienvenida
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate({ name: "settings" })}>
          ¿Tienes un respaldo? Restáuralo en Ajustes
        </button>
      </div>
    </div>
  );
}
