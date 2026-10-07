// Reordenar una lista arrastrando con el dedo (o el ratón) desde un asa, con
// desplazamiento automático en los bordes y una caída animada (FLIP). También
// se puede mover con las flechas del teclado sobre el asa.
import { useLayoutEffect, useRef, useState } from "react";

interface DragState {
  id: string;
  from: number;
  over: number;
  dy: number;
}

interface Geometry {
  tops: number[];
  heights: number[];
  gap: number;
  startY: number;
  scrollStart: number;
  pointerId: number;
  clientY: number;
  raf: number;
}

export function useDragReorder(ids: string[], onMove: (id: string, to: number) => void) {
  const [drag, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setDrag = (d: DragState | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const rows = useRef(new Map<string, HTMLElement>());
  const geo = useRef<Geometry | null>(null);
  const flip = useRef<{ id: string; top: number } | null>(null);
  const idsKey = ids.join("|");

  // Caída animada: el elemento parte de donde quedó el dedo hasta su lugar.
  useLayoutEffect(() => {
    const f = flip.current;
    flip.current = null;
    if (!f) return;
    const el = rows.current.get(f.id);
    if (!el) return;
    const delta = f.top - (el.getBoundingClientRect().top + window.scrollY);
    if (Math.abs(delta) < 1) return;
    el.style.transition = "none";
    el.style.transform = `translateY(${delta}px)`;
    void el.offsetHeight;
    el.style.transition = "transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)";
    el.style.transform = "";
  }, [idsKey]);

  const compute = (clientY: number) => {
    const g = geo.current;
    const d = dragRef.current;
    if (!g || !d) return;
    const dy = clientY - g.startY + (window.scrollY - g.scrollStart);
    const center = g.tops[d.from] + g.heights[d.from] / 2 + dy;
    let over = d.from;
    for (let i = 0; i < g.tops.length; i++) {
      if (i === d.from) continue;
      const mid = g.tops[i] + g.heights[i] / 2;
      if (i < d.from && center < mid) over = Math.min(over, i);
      if (i > d.from && center > mid) over = Math.max(over, i);
    }
    if (over !== d.over) navigator.vibrate?.(5);
    setDrag({ ...d, dy, over });
  };

  const autoScroll = () => {
    const g = geo.current;
    if (!g) return;
    const edge = 90;
    let v = 0;
    if (g.clientY < edge) v = -Math.ceil((edge - g.clientY) / 6);
    else if (g.clientY > window.innerHeight - edge) v = Math.ceil((g.clientY - (window.innerHeight - edge)) / 6);
    if (v) {
      window.scrollBy(0, v);
      compute(g.clientY);
    }
    g.raf = requestAnimationFrame(autoScroll);
  };

  const finish = (commit: boolean) => {
    const g = geo.current;
    const d = dragRef.current;
    geo.current = null;
    if (g) cancelAnimationFrame(g.raf);
    setDrag(null);
    if (g && d && commit && d.over !== d.from) {
      flip.current = { id: d.id, top: g.tops[d.from] + d.dy };
      onMove(d.id, d.over);
    }
  };

  const handleProps = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      const from = ids.indexOf(id);
      if (from < 0) return;
      const tops: number[] = [];
      const heights: number[] = [];
      for (const k of ids) {
        const r = rows.current.get(k)?.getBoundingClientRect();
        tops.push((r?.top ?? 0) + window.scrollY);
        heights.push(r?.height ?? 0);
      }
      const gap = ids.length > 1 ? Math.max(0, tops[1] - tops[0] - heights[0]) : 10;
      geo.current = { tops, heights, gap, startY: e.clientY, scrollStart: window.scrollY, pointerId: e.pointerId, clientY: e.clientY, raf: 0 };
      geo.current.raf = requestAnimationFrame(autoScroll);
      navigator.vibrate?.(12);
      setDrag({ id, from, over: from, dy: 0 });
    },
    onPointerMove: (e: React.PointerEvent) => {
      const g = geo.current;
      if (!g || g.pointerId !== e.pointerId) return;
      g.clientY = e.clientY;
      compute(e.clientY);
    },
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
    onKeyDown: (e: React.KeyboardEvent) => {
      const i = ids.indexOf(id);
      if (e.key === "ArrowUp" && i > 0) {
        e.preventDefault();
        onMove(id, i - 1);
      } else if (e.key === "ArrowDown" && i < ids.length - 1) {
        e.preventDefault();
        onMove(id, i + 1);
      }
    },
    style: { touchAction: "none" } as React.CSSProperties,
  });

  /** Estilo de cada fila mientras se arrastra (la arrastrada sigue al dedo; las demás se apartan). */
  const rowStyle = (id: string): React.CSSProperties | undefined => {
    const g = geo.current;
    if (!drag || !g) return undefined;
    const i = ids.indexOf(id);
    if (id === drag.id) return { transform: `translateY(${drag.dy}px) scale(1.02)`, transition: "none", zIndex: 5 };
    const size = g.heights[drag.from] + g.gap;
    let shift = 0;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) shift = -size;
    if (drag.over < drag.from && i >= drag.over && i < drag.from) shift = size;
    return { transform: shift ? `translateY(${shift}px)` : undefined, transition: "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)" };
  };

  const rowRef = (id: string) => (el: HTMLElement | null) => {
    if (el) rows.current.set(id, el);
    else rows.current.delete(id);
  };

  return { drag, handleProps, rowStyle, rowRef };
}
