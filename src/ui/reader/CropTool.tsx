// Recorte de una parte de la página: se arrastra un marco (con esquinas para
// ajustarlo) y la imagen se guarda en el cuaderno del libro.
import { Check, Maximize, Scissors, X } from "lucide-react";
import { useRef, useState } from "react";
import { putMedia } from "../../lib/db";
import { clamp, uid } from "../../lib/util";
import type { Clip } from "../../store/state";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import type { InkSurface } from "./inkSurface";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Drag = { mode: "new" | "move" | "nw" | "ne" | "sw" | "se"; x: number; y: number; start: Rect } | null;

interface Props {
  surface: () => InkSurface | null;
  bookId: string;
  percentOf: (chapter: number, fraction: number) => number;
  onClose: () => void;
  onSaved: (clip: Clip) => void;
}

const MIN = 28;

export function CropTool({ surface, bookId, percentOf, onClose, onSaved }: Props) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const drag = useRef<Drag>(null);

  const bounds = (): Rect => ({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });

  const norm = (r: Rect): Rect => {
    const b = bounds();
    let { x, y, w, h } = r;
    if (w < 0) {
      x += w;
      w = -w;
    }
    if (h < 0) {
      y += h;
      h = -h;
    }
    x = clamp(x, b.x, b.w - 1);
    y = clamp(y, b.y, b.h - 1);
    return { x, y, w: Math.min(w, b.w - x), h: Math.min(h, b.h - y) };
  };

  const onDown = (e: React.PointerEvent, mode: NonNullable<Drag>["mode"]) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const start = mode === "new" ? { x: e.clientX, y: e.clientY, w: 0, h: 0 } : rect!;
    drag.current = { mode, x: e.clientX, y: e.clientY, start };
    if (mode === "new") setRect(start);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const s = d.start;
    const b = bounds();
    switch (d.mode) {
      case "new":
        setRect({ x: s.x, y: s.y, w: dx, h: dy });
        break;
      case "move":
        setRect({ ...s, x: clamp(s.x + dx, 0, b.w - s.w), y: clamp(s.y + dy, 0, b.h - s.h) });
        break;
      case "nw":
        setRect({ x: s.x + dx, y: s.y + dy, w: s.w - dx, h: s.h - dy });
        break;
      case "ne":
        setRect({ x: s.x, y: s.y + dy, w: s.w + dx, h: s.h - dy });
        break;
      case "sw":
        setRect({ x: s.x + dx, y: s.y, w: s.w - dx, h: s.h + dy });
        break;
      case "se":
        setRect({ ...s, w: s.w + dx, h: s.h + dy });
        break;
    }
  };

  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setRect((r) => {
      if (!r) return r;
      const n = norm(r);
      return n.w < MIN || n.h < MIN ? null : n;
    });
  };

  const wholePage = () => {
    const s = surface();
    if (!s) return;
    const v = s.visibleBox();
    const pg = s.pageBox({ x: v.x + v.w / 2, y: v.y + v.h / 2 });
    const tl = s.toLocal(0, 0);
    // De coordenadas locales a pantalla.
    const x = Math.max(v.x, pg.x) - tl.x;
    const y = Math.max(v.y, pg.y) - tl.y;
    const right = Math.min(v.x + v.w, pg.x + pg.w) - tl.x;
    const bottom = Math.min(v.y + v.h, pg.y + pg.h) - tl.y;
    setRect(norm({ x, y, w: right - x, h: bottom - y }));
  };

  const save = async () => {
    const s = surface();
    if (!s || !rect || saving) return;
    setSaving(true);
    try {
      const tl = s.toLocal(rect.x, rect.y);
      const region = { x: tl.x, y: tl.y, w: rect.w, h: rect.h };
      const where = s.locate(region);
      const cap = await s.capture(region);
      setFlash(true);
      navigator.vibrate?.([12, 30, 12]);
      const mediaId = uid("m");
      await putMedia(mediaId, cap.blob);
      const clip = useStore.getState().addClip({
        bookId,
        chapter: where.chapter,
        view: s.view,
        offset: where.offset,
        fraction: where.fraction,
        percent: percentOf(where.chapter, where.fraction),
        mediaId,
        width: cap.width,
        height: cap.height,
        text: cap.text.slice(0, 2000),
        caption: "",
      });
      setTimeout(() => onSaved(clip), 260);
    } catch (e) {
      setSaving(false);
      toast(e instanceof Error ? e.message : "No se pudo recortar", { tone: "error" });
    }
  };

  // Mientras se arrastra hacia arriba o a la izquierda, el tamaño es negativo.
  const r = rect && { x: rect.w < 0 ? rect.x + rect.w : rect.x, y: rect.h < 0 ? rect.y + rect.h : rect.y, w: Math.abs(rect.w), h: Math.abs(rect.h) };
  return (
    <div className="crop" onPointerDown={(e) => onDown(e, "new")} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {!r && <div className="crop-dim" />}
      {r && (
        <div className="crop-rect" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} onPointerDown={(e) => onDown(e, "move")}>
          {(["nw", "ne", "sw", "se"] as const).map((c) => (
            <span key={c} className={`crop-handle ${c}`} onPointerDown={(e) => onDown(e, c)} />
          ))}
          <span className="crop-size">
            {Math.round(r.w)} × {Math.round(r.h)}
          </span>
        </div>
      )}
      {flash && <div className="crop-flash" />}
      <div className="crop-hint" onPointerDown={(e) => e.stopPropagation()}>
        <Scissors size={16} /> {r ? "Ajusta las esquinas o mueve el marco" : "Arrastra para elegir qué recortar"}
      </div>
      <div className="crop-bar" onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          <X size={17} /> Cancelar
        </button>
        <button className="btn btn-sm" onClick={wholePage}>
          <Maximize size={16} /> Página
        </button>
        <button className="btn btn-primary btn-sm" disabled={!r || saving} onClick={() => void save()}>
          <Check size={17} strokeWidth={2.6} /> {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
