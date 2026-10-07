// Modo de escritura a mano: pluma, marcador y borrador sobre la página, con
// "formas perfectas" (círculos, líneas y rectángulos limpios), deshacer y
// rehacer. Los trazos se guardan en el cuaderno del libro.
import { Check, ChevronLeft, ChevronRight, Eraser, Highlighter, PenLine, Redo2, Shapes, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { putMedia } from "../../lib/db";
import { uid } from "../../lib/util";
import { bbox, clipBox, padBox, recognizeShape, simplify, strokePath, unionBox, type Box } from "../../notes/ink";
import { INK_COLORS, inkWidthEm } from "../../notes/marks";
import type { Drawing, InkStroke } from "../../store/state";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { invalidateMedia } from "../components/media";
import type { InkSurface, Pt } from "./inkSurface";

type Op = { kind: "add" | "erase"; drawingId: string; stroke: InkStroke; index: number };

interface Props {
  surface: () => InkSurface | null;
  bookId: string;
  /** Posición actual (para ordenar el dibujo en el cuaderno). */
  where: (chapter: number) => { fraction: number; percent: number };
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

const ERASER_RADIUS = 12;

/** Genera (o actualiza) la vista previa de un dibujo: la parte de la página con sus trazos. */
export function capturePreview(s: InkSurface, d: Drawing): Promise<void> | null {
  const box = s.drawingBox(d.id);
  if (!box) return null;
  const page = s.pageBox({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
  // Toda la columna de texto a lo ancho, para que se lea el contexto.
  const wide: Box = { x: Math.min(page.x, box.x), y: box.y, w: Math.max(page.x + page.w, box.x + box.w) - Math.min(page.x, box.x), h: box.h };
  const region = clipBox(padBox(wide, 10, 22), unionBox(padBox(page, 10, 0), padBox(box, 10, 22)));
  const job = s.capture(region, box);
  return job.then(async (cap) => {
    const mediaId = d.mediaId ?? uid("m");
    await putMedia(mediaId, cap.blob);
    invalidateMedia(mediaId);
    useStore.getState().updateDrawing(d.id, { mediaId, text: cap.text.slice(0, 600) });
  });
}

export function DrawMode({ surface, bookId, where, onPrev, onNext, onClose }: Props) {
  const reader = useStore((s) => s.reader);
  const setReader = useStore((s) => s.setReader);
  const tool = reader.inkTool;
  const overlay = useRef<HTMLDivElement>(null);
  const eraserDot = useRef<HTMLDivElement>(null);
  const session = useRef({ byPage: new Map<string, string>(), touched: new Set<string>() });
  const [undo, setUndo] = useState<Op[]>([]);
  const [redo, setRedo] = useState<Op[]>([]);
  const [hint, setHint] = useState(true);
  const live = useRef<{
    id: number;
    points: number[];
    client: number[];
    path: SVGPathElement | null;
    widthPx: number;
    raf: number;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 3200);
    return () => clearTimeout(t);
  }, []);

  const drawing = (id: string) => useStore.getState().drawings.find((d) => d.id === id);

  const setStrokes = (id: string, strokes: InkStroke[]) => {
    useStore.getState().updateDrawing(id, { strokes });
    session.current.touched.add(id);
  };

  /** Guarda las vistas previas de los dibujos tocados que están a la vista. */
  const flushPreviews = (): Promise<unknown> => {
    const s = surface();
    if (!s) return Promise.resolve();
    const jobs: Promise<void>[] = [];
    for (const id of [...session.current.touched]) {
      const d = drawing(id);
      if (!d) {
        session.current.touched.delete(id);
        continue;
      }
      if (!d.strokes.length) {
        useStore.getState().purgeEntry("drawing", id);
        session.current.touched.delete(id);
        continue;
      }
      const job = capturePreview(s, d);
      if (job) {
        session.current.touched.delete(id);
        jobs.push(job.catch(() => undefined));
      }
    }
    return Promise.all(jobs);
  };

  const turn = (dir: -1 | 1) => {
    void flushPreviews();
    session.current.byPage.clear();
    if (dir < 0) onPrev();
    else onNext();
  };

  const finish = () => {
    const drew = undo.some((op) => op.kind === "add");
    void flushPreviews().then(() => {
      if (drew) toast("Trazos guardados en tu cuaderno", { icon: "✍️", tone: "success" });
    });
    onClose();
  };

  // --- Trazo en curso --------------------------------------------------------------
  const start = (e: React.PointerEvent) => {
    const s = surface();
    if (!s) return;
    const p = s.toLocal(e.clientX, e.clientY);
    if (tool === "eraser") {
      erase(s, p);
      return;
    }
    const t = tool === "marker" ? "marker" : "pen";
    const widthPx = inkWidthEm(t, reader.inkSize) * s.emPx();
    const layer = s.liveLayer();
    let path: SVGPathElement | null = null;
    if (layer) {
      path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", `ink-${t} ink-live`);
      path.setAttribute("stroke", reader.inkColor);
      path.setAttribute("stroke-width", String(widthPx));
      path.setAttribute("d", strokePath([p.x, p.y]));
      layer.appendChild(path);
    }
    live.current = { id: e.pointerId, points: [p.x, p.y], client: [e.clientX, e.clientY], path, widthPx, raf: 0 };
  };

  const move = (e: React.PointerEvent) => {
    const s = surface();
    if (!s) return;
    if (tool === "eraser") {
      if (eraserDot.current) {
        eraserDot.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        eraserDot.current.style.opacity = e.buttons ? "1" : "0.5";
      }
      if (e.buttons) erase(s, s.toLocal(e.clientX, e.clientY));
      return;
    }
    const l = live.current;
    if (!l || l.id !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = s.toLocal(ev.clientX, ev.clientY);
      const lx = l.points[l.points.length - 2];
      const ly = l.points[l.points.length - 1];
      if (Math.hypot(p.x - lx, p.y - ly) < 0.8) continue;
      l.points.push(p.x, p.y);
      l.client.push(ev.clientX, ev.clientY);
    }
    if (!l.raf) {
      l.raf = requestAnimationFrame(() => {
        l.raf = 0;
        l.path?.setAttribute("d", strokePath(l.points));
      });
    }
  };

  const end = (e: React.PointerEvent) => {
    const l = live.current;
    if (!l || l.id !== e.pointerId) return;
    live.current = null;
    if (l.raf) cancelAnimationFrame(l.raf);
    const s = surface();
    if (!s) {
      l.path?.remove();
      return;
    }
    let points = simplify(l.points, 0.5);
    let shape: InkStroke["shape"];
    if (reader.inkShapes) {
      const r = recognizeShape(l.points);
      if (r) {
        points = r.points;
        shape = r.shape;
        navigator.vibrate?.(10);
      }
    }
    const cb = bbox(l.client);
    const center: Pt = { x: cb.x + cb.w / 2, y: cb.y + cb.h / 2 };
    // La capa de captura no debe tapar el texto al buscar el ancla.
    if (overlay.current) overlay.current.style.pointerEvents = "none";
    const anchored = s.anchor(points, l.widthPx, center);
    if (overlay.current) overlay.current.style.pointerEvents = "";
    l.path?.remove();
    if (!anchored) return;
    const stroke: InkStroke = {
      id: uid("s"),
      tool: tool === "marker" ? "marker" : "pen",
      color: reader.inkColor,
      width: Math.round(anchored.width * 10000) / 10000,
      points: anchored.points,
      anchor: anchored.anchor,
      ...(shape ? { shape } : {}),
    };
    const key = s.pageKey({ x: points[0], y: points[1] });
    const store = useStore.getState();
    let id = session.current.byPage.get(key);
    const existing = id ? drawing(id) : undefined;
    let target = existing && existing.chapter === anchored.chapter ? existing : undefined;
    if (!target) {
      target = s
        .drawingsInView()
        .map((d) => drawing(d))
        .find((d): d is Drawing => !!d && d.chapter === anchored.chapter && d.view === s.view && !d.discardedAt);
    }
    if (target) {
      id = target.id;
      setStrokes(id, [...target.strokes, stroke]);
    } else {
      const pos = where(anchored.chapter);
      const d = store.addDrawing({
        bookId,
        chapter: anchored.chapter,
        view: s.view,
        strokes: [stroke],
        text: "",
        fraction: pos.fraction,
        percent: pos.percent,
      });
      id = d.id;
      session.current.touched.add(id);
    }
    session.current.byPage.set(key, id);
    setUndo((u) => [...u, { kind: "add", drawingId: id!, stroke, index: drawing(id!)!.strokes.length - 1 }]);
    setRedo([]);
  };

  const erase = (s: InkSurface, p: Pt) => {
    const hit = s.hitStroke(p, ERASER_RADIUS);
    if (!hit) return;
    const d = drawing(hit.drawingId);
    if (!d) return;
    const index = d.strokes.findIndex((k) => k.id === hit.strokeId);
    if (index < 0) return;
    const stroke = d.strokes[index];
    setStrokes(d.id, d.strokes.filter((k) => k.id !== hit.strokeId));
    setUndo((u) => [...u, { kind: "erase", drawingId: d.id, stroke, index }]);
    setRedo([]);
    navigator.vibrate?.(6);
  };

  const apply = (op: Op, reverse: boolean) => {
    const d = drawing(op.drawingId);
    if (!d) return;
    const remove = (op.kind === "add") !== reverse;
    if (remove) setStrokes(d.id, d.strokes.filter((k) => k.id !== op.stroke.id));
    else {
      const strokes = d.strokes.slice();
      strokes.splice(Math.min(op.index, strokes.length), 0, op.stroke);
      setStrokes(d.id, strokes);
    }
  };

  const doUndo = () => {
    const op = undo[undo.length - 1];
    if (!op) return;
    apply(op, true);
    setUndo(undo.slice(0, -1));
    setRedo([...redo, op]);
  };

  const doRedo = () => {
    const op = redo[redo.length - 1];
    if (!op) return;
    apply(op, false);
    setRedo(redo.slice(0, -1));
    setUndo([...undo, op]);
  };

  return (
    <>
      <div
        ref={overlay}
        className={`draw-capture ${tool === "eraser" ? "erasing" : ""}`}
        onPointerDown={(e) => {
          if (!e.isPrimary) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setHint(false);
          start(e);
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={() => {
          if (eraserDot.current) eraserDot.current.style.opacity = "0";
        }}
      />
      {tool === "eraser" && <div ref={eraserDot} className="eraser-dot" style={{ width: ERASER_RADIUS * 2, height: ERASER_RADIUS * 2 }} />}
      {hint && <div className="draw-hint">Escribe, encierra o subraya con el dedo ✍️</div>}

      <button className="draw-turn left" onClick={() => turn(-1)} aria-label="Página anterior">
        <ChevronLeft size={22} />
      </button>
      <button className="draw-turn right" onClick={() => turn(1)} aria-label="Página siguiente">
        <ChevronRight size={22} />
      </button>

      <div className="draw-bar" role="toolbar" aria-label="Escritura a mano">
        <div className="draw-row">
          <button className={`draw-tool ${tool === "pen" ? "active" : ""}`} onClick={() => setReader({ inkTool: "pen" })}>
            <PenLine size={20} />
            <span>Pluma</span>
          </button>
          <button className={`draw-tool ${tool === "marker" ? "active" : ""}`} onClick={() => setReader({ inkTool: "marker" })}>
            <Highlighter size={20} />
            <span>Marcador</span>
          </button>
          <button className={`draw-tool ${tool === "eraser" ? "active" : ""}`} onClick={() => setReader({ inkTool: "eraser" })}>
            <Eraser size={20} />
            <span>Borrador</span>
          </button>
          <span className="draw-sep" />
          <button className="draw-icon" onClick={doUndo} disabled={!undo.length} aria-label="Deshacer">
            <Undo2 size={20} />
          </button>
          <button className="draw-icon" onClick={doRedo} disabled={!redo.length} aria-label="Rehacer">
            <Redo2 size={20} />
          </button>
          <button className="draw-done" onClick={finish}>
            <Check size={18} strokeWidth={2.6} /> Listo
          </button>
        </div>
        <div className={`draw-row draw-options ${tool === "eraser" ? "dim" : ""}`}>
          <div className="draw-colors">
            {INK_COLORS.map((c) => (
              <button
                key={c.id}
                className={`ink-dot ${reader.inkColor === c.id ? "active" : ""}`}
                style={{ ["--ink" as string]: c.id }}
                aria-label={c.label}
                onClick={() => setReader({ inkColor: c.id, ...(tool === "eraser" ? { inkTool: "pen" } : {}) })}
              />
            ))}
          </div>
          <span className="draw-sep" />
          <div className="draw-sizes" role="radiogroup" aria-label="Grosor">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={reader.inkSize === n}
                aria-label={["Fino", "Medio", "Grueso"][n - 1]}
                className={`ink-size ${reader.inkSize === n ? "active" : ""}`}
                onClick={() => setReader({ inkSize: n })}
              >
                <i style={{ width: 3 + n * 3, height: 3 + n * 3, background: reader.inkColor }} />
              </button>
            ))}
          </div>
          <button
            className={`draw-shapes ${reader.inkShapes ? "active" : ""}`}
            onClick={() => {
              setReader({ inkShapes: !reader.inkShapes });
              toast(reader.inkShapes ? "Formas a mano alzada" : "Formas perfectas: tus círculos y líneas quedan limpios", { icon: "✨" });
            }}
            aria-pressed={reader.inkShapes}
            aria-label="Formas perfectas"
          >
            <Shapes size={18} />
          </button>
        </div>
      </div>
    </>
  );
}
