// Tarjetas de las entradas del cuaderno: citas remarcadas, trazos, recortes,
// notas sueltas y marcadores, cada una con su propio aspecto.
import { ArchiveRestore, Bookmark, Image as ImageIcon, NotebookPen, PenLine, Scissors, Trash2, X } from "lucide-react";
import { formatDate, formatRelative, hashString } from "../../lib/util";
import { HIGHLIGHT_COLORS, markStyleInfo, NOTE_TINTS } from "../../notes/marks";
import type { NotebookEntry } from "../../notes/notebook";
import { useMediaUrl } from "../components/media";

interface Props {
  entry: NotebookEntry;
  place: string;
  discarded: boolean;
  onGo?: () => void;
  onDiscard: () => void;
  onRestore: () => void;
  onPurge: () => void;
  onEdit: () => void;
  onCard?: () => void;
}

/** Inclinación pequeña y estable para fotos y notas adhesivas. */
const tilt = (id: string, k = 0.7) => `${((hashString(id) % 5) - 2) * k}deg`;

export function EntryCard(p: Props) {
  const { entry: e, discarded } = p;
  const tail = discarded ? (
    <div className="nb-restore">
      <span className="faint">Descartado {formatRelative(e.item.discardedAt ?? Date.now())}</span>
      <span className="spacer" />
      <button className="btn btn-sm" onClick={p.onRestore}>
        <ArchiveRestore size={15} /> Recuperar
      </button>
      <button className="icon-btn" onClick={p.onPurge} aria-label="Borrar para siempre">
        <Trash2 size={17} />
      </button>
    </div>
  ) : null;
  const discardBtn = !discarded && (
    <button className="nb-x" onClick={p.onDiscard} aria-label="Descartar" title="Descartar">
      <X size={15} strokeWidth={2.4} />
    </button>
  );

  switch (e.kind) {
    case "highlight": {
      const h = e.item;
      const info = markStyleInfo(h.style);
      return (
        <article className="nb-entry nb-quote" style={{ ["--c" as string]: HIGHLIGHT_COLORS[h.color]?.dot }}>
          {discardBtn}
          <button className="nb-quote-main" onClick={p.onGo} disabled={!p.onGo}>
            <p className="nb-quote-text">
              <span className="mk" data-s={h.style} data-c={h.color}>
                {h.text}
              </span>
            </p>
          </button>
          {h.note && (
            <p className="nb-note hand">
              <NotebookPen size={14} /> {h.note}
            </p>
          )}
          <footer className="nb-meta">
            <span className="nb-dot" />
            <span className="ellipsis">
              {info.noun} · {p.place}
            </span>
            <span className="spacer" />
            {!discarded && p.onCard && (
              <button className="nb-mini" onClick={p.onCard} aria-label="Tarjeta para compartir" title="Tarjeta">
                <ImageIcon size={16} />
              </button>
            )}
            {!discarded && (
              <button className="nb-mini" onClick={p.onEdit} aria-label="Editar" title="Editar">
                <NotebookPen size={16} />
              </button>
            )}
          </footer>
          {tail}
        </article>
      );
    }
    case "bookmark": {
      const b = e.item;
      return (
        <article className="nb-entry nb-bookmark">
          {discardBtn}
          <button className="nb-bookmark-main" onClick={p.onGo} disabled={!p.onGo}>
            <span className="nb-ribbon" aria-hidden>
              <Bookmark size={18} fill="currentColor" />
            </span>
            <span className="nb-bookmark-text">
              <b>{Math.round(b.percent * 100)}%</b> · {b.label}
            </span>
          </button>
          <footer className="nb-meta">
            <span className="ellipsis">Marcador · {formatDate(b.createdAt)}</span>
          </footer>
          {tail}
        </article>
      );
    }
    case "drawing":
    case "clip":
      return <PhotoEntry {...p} />;
    case "note": {
      const n = e.item;
      const tint = NOTE_TINTS[n.tint] ?? NOTE_TINTS.lemon;
      return (
        <article className="nb-entry nb-sticky" style={{ ["--tint" as string]: tint.bg, ["--tint-ink" as string]: tint.ink, ["--tilt" as string]: tilt(n.id, 0.6) }}>
          {discardBtn}
          <button className="nb-sticky-main hand" onClick={p.onEdit} disabled={discarded}>
            {n.text}
          </button>
          <footer className="nb-meta">
            <span className="ellipsis">
              {n.chapter !== undefined ? p.place : "Nota"} · {formatDate(n.updatedAt)}
            </span>
            <span className="spacer" />
            {!discarded && p.onGo && n.chapter !== undefined && (
              <button className="nb-mini" onClick={p.onGo}>
                Ir
              </button>
            )}
          </footer>
          {tail}
        </article>
      );
    }
  }
}

function PhotoEntry(p: Props) {
  const e = p.entry;
  const isClip = e.kind === "clip";
  const item = e.item as { id: string; mediaId?: string; text: string; caption?: string; width?: number; height?: number; createdAt: number };
  const url = useMediaUrl(item.mediaId);
  const ratio = item.width && item.height ? item.width / item.height : 1.6;
  return (
    <article className={`nb-entry nb-photo ${isClip ? "clip" : "ink"}`} style={{ ["--tilt" as string]: tilt(item.id) }}>
      <span className="nb-tape" aria-hidden />
      {!p.discarded && (
        <button className="nb-x" onClick={p.onDiscard} aria-label="Descartar" title="Descartar">
          <X size={15} strokeWidth={2.4} />
        </button>
      )}
      <button className="nb-photo-img" onClick={p.onEdit} style={{ aspectRatio: url ? undefined : `${Math.max(0.6, Math.min(3, ratio))}` }}>
        {url ? (
          <img src={url} alt={isClip ? "Recorte del libro" : "Trazo a mano"} loading="lazy" />
        ) : (
          <span className="nb-photo-empty">{isClip ? <Scissors size={26} /> : <PenLine size={26} />}</span>
        )}
      </button>
      <div className="nb-photo-caption">
        {isClip && item.caption ? <span className="hand nb-caption">{item.caption}</span> : null}
        {!isClip && item.text ? <span className="nb-photo-text">«{item.text.slice(0, 140)}{item.text.length > 140 ? "…" : ""}»</span> : null}
      </div>
      <footer className="nb-meta">
        {isClip ? <Scissors size={13} /> : <PenLine size={13} />}
        <span className="ellipsis">
          {isClip ? "Recorte" : "Trazo a mano"} · {p.place}
        </span>
        <span className="spacer" />
        {!p.discarded && p.onGo && (
          <button className="nb-mini" onClick={p.onGo}>
            Ir
          </button>
        )}
      </footer>
      {p.discarded && (
        <div className="nb-restore">
          <span className="spacer" />
          <button className="btn btn-sm" onClick={p.onRestore}>
            <ArchiveRestore size={15} /> Recuperar
          </button>
          <button className="icon-btn" onClick={p.onPurge} aria-label="Borrar para siempre">
            <Trash2 size={17} />
          </button>
        </div>
      )}
    </article>
  );
}
