// Hojas del cuaderno: personalizar, nota suelta y ver un recorte o un trazo.
import { BookOpen, Check, Share2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { deliverFile } from "../../backup/backup";
import { getMedia } from "../../lib/db";
import { NOTE_TINTS, NOTEBOOK_COVER_IDS, NOTEBOOK_COVERS, NOTEBOOK_STICKERS } from "../../notes/marks";
import type { Clip, Drawing, LooseNote, Notebook, NotebookPaper, NoteTint } from "../../store/state";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { useMediaUrl } from "../components/media";
import { Sheet } from "../components/Sheet";

const PAPERS: { id: NotebookPaper; label: string }[] = [
  { id: "lined", label: "Rayado" },
  { id: "dots", label: "Punteado" },
  { id: "grid", label: "Cuadriculado" },
  { id: "plain", label: "Liso" },
];

/** Portada dibujada de un cuaderno (tela, lomo, elástico y etiqueta). */
export function NotebookCoverArt({ nb, small }: { nb: Notebook; small?: boolean }) {
  const c = NOTEBOOK_COVERS[nb.cover] ?? NOTEBOOK_COVERS.terracota;
  return (
    <div className={`nb-art ${small ? "small" : ""}`} style={{ ["--a" as string]: c.a, ["--b" as string]: c.b, ["--ink" as string]: c.ink }} aria-hidden>
      <span className="nb-art-pages" />
      <span className="nb-art-body" />
      <span className="nb-art-spine" />
      <span className="nb-art-band" />
      <span className="nb-art-label">
        <span className="nb-art-sticker">{nb.sticker}</span>
        <span className="nb-art-name">{nb.name}</span>
      </span>
    </div>
  );
}

export function NotebookSettingsSheet({ open, nb, onClose }: { open: boolean; nb: Notebook; onClose: () => void }) {
  const setNotebook = useStore((s) => s.setNotebook);
  const [name, setName] = useState(nb.name);
  useEffect(() => {
    if (open) setName(nb.name);
  }, [open, nb.name]);
  const close = () => {
    const n = name.trim();
    if (n && n !== nb.name) {
      setNotebook(nb.bookId, { name: n.slice(0, 80) });
      toast("Cuaderno renombrado", { icon: "📓", tone: "success" });
    }
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title="Personalizar cuaderno" height="86dvh">
      <div className="nb-settings-preview">
        <NotebookCoverArt nb={{ ...nb, name: name || nb.name }} />
      </div>
      <label className="label" htmlFor="nb-name">
        Nombre
      </label>
      <input
        id="nb-name"
        className="field"
        value={name}
        maxLength={80}
        placeholder="Ponle el nombre que quieras"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && close()}
      />
      <div className="label">Tapa</div>
      <div className="nb-swatches" role="radiogroup" aria-label="Color de la tapa">
        {NOTEBOOK_COVER_IDS.map((id) => {
          const c = NOTEBOOK_COVERS[id];
          return (
            <button
              key={id}
              role="radio"
              aria-checked={nb.cover === id}
              aria-label={c.label}
              title={c.label}
              className={`nb-swatch ${nb.cover === id ? "active" : ""}`}
              style={{ background: `linear-gradient(135deg, ${c.a}, ${c.b})` }}
              onClick={() => setNotebook(nb.bookId, { cover: id })}
            >
              {nb.cover === id && <Check size={16} color={c.ink} strokeWidth={3} />}
            </button>
          );
        })}
      </div>
      <div className="label">Hojas</div>
      <div className="nb-papers" role="radiogroup" aria-label="Tipo de hoja">
        {PAPERS.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={nb.paper === p.id}
            className={`nb-paper-opt ${nb.paper === p.id ? "active" : ""}`}
            onClick={() => setNotebook(nb.bookId, { paper: p.id })}
          >
            <span className="nb-paper-sample" data-paper={p.id} />
            {p.label}
          </button>
        ))}
      </div>
      <div className="label">Sello</div>
      <div className="nb-stickers">
        {NOTEBOOK_STICKERS.map((s) => (
          <button key={s} className={`nb-sticker ${nb.sticker === s ? "active" : ""}`} onClick={() => setNotebook(nb.bookId, { sticker: s })} aria-label={`Sello ${s}`}>
            {s}
          </button>
        ))}
      </div>
      <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} onClick={close}>
        Listo
      </button>
    </Sheet>
  );
}

/** Escribir o editar una nota suelta del cuaderno. */
export function LooseNoteSheet({
  open,
  bookId,
  note,
  here,
  onClose,
}: {
  open: boolean;
  bookId: string;
  note: LooseNote | null;
  /** Lugar actual del libro (si se escribe desde el lector). */
  here?: { chapter: number; fraction: number; percent: number; label: string };
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [tint, setTint] = useState<NoteTint>("lemon");
  const [link, setLink] = useState(false);
  useEffect(() => {
    if (!open) return;
    setText(note?.text ?? "");
    setTint(note?.tint ?? "lemon");
    setLink(note ? note.chapter !== undefined : !!here);
  }, [open, note, here]);

  const save = () => {
    const t = text.trim();
    const store = useStore.getState();
    const place = link && here ? { chapter: here.chapter, fraction: here.fraction, percent: here.percent } : {};
    if (note) {
      if (!t) store.discardEntry("note", note.id);
      else store.updateLooseNote(note.id, { text: t, tint, ...(link || note.chapter === undefined ? place : {}) });
    } else if (t) {
      store.addLooseNote({ bookId, text: t, tint, ...place });
      toast("Nota pegada en tu cuaderno", { icon: "🗒️", tone: "success" });
    }
    onClose();
  };

  const t = NOTE_TINTS[tint];
  return (
    <Sheet open={open} onClose={save} title={note ? "Nota" : "Nueva nota"}>
      <div className="sticky-editor" style={{ ["--tint" as string]: t.bg, ["--tint-ink" as string]: t.ink }}>
        <textarea
          className="hand"
          autoFocus
          value={text}
          placeholder="Escribe lo que quieras recordar…"
          onChange={(e) => setText(e.target.value)}
          aria-label="Texto de la nota"
        />
      </div>
      <div className="row" style={{ marginTop: 12, gap: 10 }}>
        {(Object.keys(NOTE_TINTS) as NoteTint[]).map((k) => (
          <button
            key={k}
            className={`tint-dot ${tint === k ? "active" : ""}`}
            style={{ background: NOTE_TINTS[k].bg }}
            aria-label={NOTE_TINTS[k].label}
            onClick={() => setTint(k)}
          />
        ))}
      </div>
      {here && (
        <label className="nb-link-toggle">
          <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />
          <span>
            Vincular a <b>{here.label}</b>
          </span>
        </label>
      )}
      <div className="row" style={{ marginTop: 16 }}>
        {note && (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              useStore.getState().discardEntry("note", note.id);
              onClose();
            }}
          >
            <Trash2 size={16} /> Descartar
          </button>
        )}
        <span className="spacer" />
        <button className="btn btn-primary" onClick={save}>
          Guardar
        </button>
      </div>
    </Sheet>
  );
}

/** Ver un recorte o un trazo en grande, con su pie de foto. */
export function PhotoSheet({
  item,
  bookTitle,
  place,
  onGo,
  onClose,
}: {
  item: { kind: "clip"; data: Clip } | { kind: "drawing"; data: Drawing } | null;
  bookTitle: string;
  place: string;
  onGo?: () => void;
  onClose: () => void;
}) {
  const live = useStore((s) =>
    item ? (item.kind === "clip" ? s.clips.find((c) => c.id === item.data.id) : s.drawings.find((d) => d.id === item.data.id)) : undefined
  );
  const data = live ?? item?.data;
  const url = useMediaUrl(data?.mediaId);
  const [caption, setCaption] = useState("");
  useEffect(() => {
    if (item?.kind === "clip") setCaption(item.data.caption);
  }, [item]);
  const isClip = item?.kind === "clip";

  const close = () => {
    if (item?.kind === "clip" && caption.trim() !== item.data.caption) useStore.getState().updateClip(item.data.id, { caption: caption.trim() });
    onClose();
  };

  const share = async () => {
    if (!data?.mediaId) return;
    const blob = await getMedia(data.mediaId);
    if (!blob) return;
    const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png";
    await deliverFile(new File([blob], `${bookTitle.slice(0, 40)} - ${isClip ? "recorte" : "trazo"}.${ext}`, { type: blob.type }), true);
  };

  return (
    <Sheet open={!!item} onClose={close} title={isClip ? "Recorte" : "Trazo a mano"} height="88dvh">
      {data && (
        <>
          <div className="photo-big">
            <span className="nb-tape" aria-hidden />
            {url ? <img src={url} alt="" /> : <div className="photo-big-empty">Sin vista previa</div>}
            {isClip && (
              <input
                className="photo-caption hand"
                value={caption}
                placeholder="Escribe un pie de foto…"
                onChange={(e) => setCaption(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && close()}
                aria-label="Pie de foto"
              />
            )}
          </div>
          <p className="faint photo-place">{place}</p>
          {data.text && (
            <details className="photo-text">
              <summary>Texto de esta parte</summary>
              <p>{data.text}</p>
            </details>
          )}
          <div className="row" style={{ marginTop: 14, flexWrap: "wrap", gap: 8 }}>
            {onGo && (
              <button
                className="btn btn-sm"
                onClick={() => {
                  close();
                  onGo();
                }}
              >
                <BookOpen size={16} /> Ir al libro
              </button>
            )}
            <button className="btn btn-sm" onClick={() => void share()} disabled={!url}>
              <Share2 size={16} /> Compartir
            </button>
            <span className="spacer" />
            <button
              className="btn btn-sm btn-danger"
              onClick={() => {
                const kind = isClip ? "clip" : "drawing";
                const id = data.id;
                useStore.getState().discardEntry(kind, id);
                toast(isClip ? "Recorte descartado" : "Trazo descartado", {
                  icon: "🗑️",
                  action: { label: "Deshacer", run: () => useStore.getState().restoreEntry(kind, id) },
                }, 5000);
                onClose();
              }}
            >
              <Trash2 size={16} /> Descartar
            </button>
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={close}>
            Listo
          </button>
        </>
      )}
    </Sheet>
  );
}
