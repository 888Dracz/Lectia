import {
  BookOpen,
  CircleCheck,
  Circle,
  Download,
  Heart,
  ImagePlus,
  ListOrdered,
  NotebookText,
  Pencil,
  LibraryBig,
  Trash,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { downscaleImage } from "../../books/importer";
import { forgetBookContent } from "../../books/load";
import { FORMAT_LABEL } from "../../books/types";
import { getFile, putCover } from "../../lib/db";
import { navigate } from "../../lib/router";
import { formatBytes, formatDate, formatDuration, formatNumber } from "../../lib/util";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { deliverFile } from "../../backup/backup";
import { Cover, invalidateCover } from "../components/Cover";
import { choiceDialog, promptDialog } from "../components/Dialog";
import { isActiveItem } from "../../notes/readingList";
import { Sheet } from "../components/Sheet";
import { pickFiles } from "./importFlow";
import { openBook } from "./useOpenBook";

export function BookActionsSheet({ bookId, onClose }: { bookId: string | null; onClose: () => void }) {
  const book = useStore((s) => (bookId ? s.books[bookId] : undefined));
  const collections = useStore((s) => s.collections);
  const highlights = useStore((s) => s.highlights.filter((h) => h.bookId === bookId && !h.discardedAt).length);
  const noteCount = useStore(
    (s) =>
      s.highlights.filter((h) => h.bookId === bookId && !h.discardedAt).length +
      s.drawings.filter((d) => d.bookId === bookId && !d.discardedAt).length +
      s.clips.filter((c) => c.bookId === bookId && !c.discardedAt).length +
      s.looseNotes.filter((n) => n.bookId === bookId && !n.discardedAt).length +
      s.bookmarks.filter((b) => b.bookId === bookId && !b.discardedAt).length
  );
  const listPos = useStore((s) => s.readingList.filter(isActiveItem).findIndex((i) => i.bookId === bookId));
  const store = useStore.getState();
  const [view, setView] = useState<"main" | "edit" | "shelves">("main");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");

  useEffect(() => {
    if (bookId) setView("main");
  }, [bookId]);

  const open = !!book;

  if (!book) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const pct = Math.round((book.location?.percent ?? 0) * 100);

  const startEdit = () => {
    setTitle(book.title);
    setAuthor(book.author);
    setView("edit");
  };

  const remove = async () => {
    onClose();
    const choice = await choiceDialog(
      "¿Eliminar este libro?",
      noteCount
        ? `Se borrará “${book.title}” de este dispositivo. Su cuaderno tiene ${noteCount} ${noteCount === 1 ? "nota" : "notas"}: ¿lo conservas?`
        : `Se borrará “${book.title}” de este dispositivo.`,
      noteCount
        ? [
            { label: "Borrar todo", value: "all", tone: "danger" },
            { label: "Conservar cuaderno", value: "keep", tone: "primary" },
          ]
        : [{ label: "Eliminar", value: "all", tone: "danger" }]
    );
    if (!choice) return;
    forgetBookContent(book.id);
    invalidateCover(book.id);
    await store.removeBook(book.id, choice === "keep");
    toast(choice === "keep" ? "Libro eliminado; su cuaderno sigue en Cuadernos" : "Libro eliminado");
  };

  const exportFile = async () => {
    const blob = await getFile(book.id);
    if (!blob) return toast("No se encontró el archivo", { tone: "error" });
    await deliverFile(new File([blob], book.fileName, { type: blob.type }), true);
  };

  const changeCover = () =>
    pickFiles(async (files) => {
      const f = files[0];
      if (!f || !f.type.startsWith("image/")) return;
      await putCover(book.id, await downscaleImage(f));
      invalidateCover(book.id);
      store.updateBook(book.id, { hasCover: true, coverRev: Date.now() });
      toast("Portada actualizada", { tone: "success" });
    }, "image/*");

  return (
    <Sheet open={open} onClose={onClose}>
      {view === "main" && (
        <>
          <div className="bs-head">
            <div className="bs-cover">
              <Cover book={book} />
            </div>
            <div className="bs-info">
              <h3 className="display">{book.title}</h3>
              <div className="muted">{book.author || "Autor desconocido"}</div>
              <div className="bs-tags">
                <span className="fmt-chip">{FORMAT_LABEL[book.format]}</span>
                <span className="faint">{formatBytes(book.fileSize)}</span>
              </div>
              <div className="bs-stats">
                <span>
                  <b>{pct}%</b> leído
                </span>
                {book.readingMs > 0 && (
                  <span>
                    <b>{formatDuration(book.readingMs)}</b>
                  </span>
                )}
                {book.wordCount ? (
                  <span>
                    <b>{formatNumber(book.wordCount)}</b> palabras
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {book.description && <p className="bs-desc">{book.description}</p>}

          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              onClose();
              openBook(book.id);
            }}
          >
            <BookOpen size={19} /> {book.status === "reading" ? "Seguir leyendo" : book.status === "finished" ? "Releer" : "Empezar a leer"}
          </button>

          <div className="list" style={{ marginTop: 14 }}>
            <button className="list-item" onClick={() => store.toggleFavorite(book.id)}>
              <span className="li-icon" style={{ color: "var(--rose)", background: "rgba(255,122,162,.14)" }}>
                <Heart size={18} fill={book.favorite ? "currentColor" : "none"} />
              </span>
              <span className="li-main li-title">{book.favorite ? "Quitar de favoritos" : "Añadir a favoritos"}</span>
            </button>
            <button className="list-item" onClick={() => setView("shelves")}>
              <span className="li-icon">
                <LibraryBig size={18} />
              </span>
              <span className="li-main">
                <div className="li-title">Estanterías</div>
                <div className="li-sub">
                  {book.collections.length
                    ? collections.filter((c) => book.collections.includes(c.id)).map((c) => `${c.emoji} ${c.name}`).join(", ")
                    : "Sin estantería"}
                </div>
              </span>
            </button>
            <button
              className="list-item"
              onClick={() => {
                if (listPos >= 0) {
                  onClose();
                  navigate({ name: "readingList" });
                } else if (store.addToReadingList({ bookId: book.id, title: book.title, author: book.author })) {
                  toast("Añadido a tu lista por leer", { icon: "🗒️", tone: "success" });
                }
              }}
            >
              <span className="li-icon" style={{ color: "var(--teal)", background: "rgba(69,208,193,.14)" }}>
                <ListOrdered size={18} />
              </span>
              <span className="li-main">
                <div className="li-title">{listPos >= 0 ? `En tu lista por leer · #${listPos + 1}` : "Añadir a la lista por leer"}</div>
                {listPos >= 0 && <div className="li-sub">Toca para ver y ordenar la lista</div>}
              </span>
            </button>
            <button
              className="list-item"
              onClick={() => {
                onClose();
                navigate({ name: "notebook", bookId: book.id });
              }}
            >
              <span className="li-icon" style={{ color: "var(--orange)", background: "rgba(255,159,67,.14)" }}>
                <NotebookText size={18} />
              </span>
              <span className="li-main">
                <div className="li-title">Cuaderno de notas</div>
                <div className="li-sub">{noteCount ? `${noteCount} ${noteCount === 1 ? "entrada" : "entradas"}` : "Aún en blanco"}</div>
              </span>
            </button>
            <button className="list-item" onClick={() => store.setFinished(book.id, book.status !== "finished")}>
              <span className="li-icon" style={{ color: "var(--green)", background: "rgba(79,214,138,.14)" }}>
                {book.status === "finished" ? <Circle size={18} /> : <CircleCheck size={18} />}
              </span>
              <span className="li-main li-title">{book.status === "finished" ? "Marcar como no terminado" : "Marcar como terminado"}</span>
            </button>
            {book.format !== "cbz" && (
              <button
                className="list-item"
                onClick={() => {
                  onClose();
                  store.setApp({ trainingSource: book.id });
                  navigate({ name: "game", game: "rsvp" });
                }}
              >
                <span className="li-icon" style={{ color: "var(--violet)", background: "rgba(155,140,255,.15)" }}>
                  <Zap size={18} />
                </span>
                <span className="li-main li-title">Lectura rápida con este libro</span>
              </button>
            )}
            <button className="list-item" onClick={startEdit}>
              <span className="li-icon">
                <Pencil size={18} />
              </span>
              <span className="li-main li-title">Editar título y autor</span>
            </button>
            <button className="list-item" onClick={changeCover}>
              <span className="li-icon">
                <ImagePlus size={18} />
              </span>
              <span className="li-main li-title">Cambiar portada</span>
            </button>
            <button className="list-item" onClick={() => void exportFile()}>
              <span className="li-icon">
                <Download size={18} />
              </span>
              <span className="li-main">
                <div className="li-title">Compartir o guardar archivo</div>
                <div className="li-sub">{book.fileName}</div>
              </span>
            </button>
            <button className="list-item" onClick={() => void remove()}>
              <span className="li-icon" style={{ color: "var(--red)", background: "rgba(255,107,107,.14)" }}>
                <Trash size={18} />
              </span>
              <span className="li-main li-title" style={{ color: "var(--red)" }}>
                Eliminar libro
              </span>
            </button>
          </div>
          <p className="faint small-print">
            Agregado el {formatDate(book.addedAt)}
            {highlights ? ` · ${highlights} subrayados` : ""}
          </p>
        </>
      )}

      {view === "edit" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            store.updateBook(book.id, { title: title.trim() || book.title, author: author.trim() });
            setView("main");
            toast("Guardado", { tone: "success" });
          }}
        >
          <h3 className="sheet-title" style={{ marginBottom: 6 }}>
            Editar libro
          </h3>
          <label className="label" htmlFor="ed-title">
            Título
          </label>
          <input id="ed-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="label" htmlFor="ed-author">
            Autor
          </label>
          <input id="ed-author" className="field" value={author} onChange={(e) => setAuthor(e.target.value)} />
          <div className="row" style={{ marginTop: 18 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setView("main")}>
              Cancelar
            </button>
            <span className="spacer" />
            <button type="submit" className="btn btn-primary">
              Guardar
            </button>
          </div>
        </form>
      )}

      {view === "shelves" && (
        <>
          <h3 className="sheet-title" style={{ marginBottom: 12 }}>
            Estanterías
          </h3>
          <div className="list">
            {collections.map((c) => {
              const on = book.collections.includes(c.id);
              return (
                <button key={c.id} className="list-item" onClick={() => store.toggleBookCollection(book.id, c.id)}>
                  <span className="li-icon emoji">{c.emoji}</span>
                  <span className="li-main li-title">{c.name}</span>
                  {on ? <CircleCheck size={22} color="var(--accent)" /> : <Circle size={22} color="var(--text-3)" />}
                </button>
              );
            })}
            <button
              className="list-item"
              onClick={async () => {
                const name = await promptDialog("Nueva estantería", "", "Nombre", "Crear");
                if (name?.trim()) {
                  const id = store.createCollection(name.trim(), "📚");
                  store.toggleBookCollection(book.id, id);
                }
              }}
            >
              <span className="li-icon">+</span>
              <span className="li-main li-title">Nueva estantería</span>
            </button>
          </div>
          <button className="btn btn-block" style={{ marginTop: 14 }} onClick={() => setView("main")}>
            Listo
          </button>
        </>
      )}
    </Sheet>
  );
}
