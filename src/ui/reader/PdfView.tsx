// Vista de PDF con las páginas originales: desplazamiento vertical continuo,
// dibujado a pedido (solo las páginas cercanas), zoom con pellizco y filtros
// de color para leer de noche.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { PdfContent } from "../../books/types";
import { clamp } from "../../lib/util";
import { bbox, intersects, padBox, strokeHit, transformPoints, unionBox, type Box } from "../../notes/ink";
import { canvasToBlob, rasterizePdf } from "../../notes/raster";
import type { Drawing, ReaderSettings } from "../../store/state";
import { captureScale, inkPathHtml, toPaint, type CachedStroke, type InkSurface } from "./inkSurface";
import type { GoTarget, ViewHandle, ViewLocation } from "./ReflowView";

interface Props {
  content: PdfContent;
  settings: ReaderSettings;
  initial: { chapter: number; fraction: number };
  pdfFilter: string;
  /** Trazos a mano sobre las páginas originales. */
  drawings: Drawing[];
  /** Mientras se dibuja o recorta, los toques no pasan página ni hacen zoom. */
  locked: boolean;
  menuOpen: boolean;
  onLocation: (l: ViewLocation) => void;
  onCenterTap: () => void;
  onPageTurn: () => void;
  onReachEnd: () => void;
  onZoom: (z: number) => void;
}

const GAP = 10;
const MAX_RENDERED = 7;

/** Texto de un PDF dentro de una zona de la página (en fracciones del ancho). */
async function pdfRegionText(content: PdfContent, page: number, box: Box): Promise<string> {
  try {
    const pg = await content.doc.getPage(page + 1);
    const vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    const words: string[] = [];
    for (const item of tc.items as { str?: string; transform?: number[] }[]) {
      if (!item.str?.trim() || !item.transform) continue;
      const [x, y] = vp.convertToViewportPoint(item.transform[4], item.transform[5]);
      const nx = x / vp.width;
      const ny = y / vp.width;
      if (nx >= box.x - 0.02 && nx <= box.x + box.w && ny >= box.y && ny <= box.y + box.h + 0.02) words.push(item.str.trim());
    }
    return words.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

export const PdfView = forwardRef<ViewHandle, Props>(function PdfView(props, ref) {
  const { content, settings } = props;
  const p = useRef(props);
  p.current = props;
  const n = content.numPages;
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [ratios, setRatios] = useState<number[]>(() => Array(n).fill(1.414));
  const ratiosRef = useRef(ratios);
  ratiosRef.current = ratios;
  const zoom = clamp(settings.pdfZoom || 1, 1, 4);
  const pageW = Math.round(width * zoom);
  const heights = ratios.map((r) => Math.round(pageW * r));
  const tops = useRef<number[]>([]);
  tops.current = [];
  {
    let acc = GAP;
    for (let i = 0; i < n; i++) {
      tops.current.push(acc);
      acc += heights[i] + GAP;
    }
  }
  const state = useRef({ page: props.initial.chapter, restored: false, lastReported: -1 });
  const rendered = useRef(new Map<number, { canvas: HTMLCanvasElement; scale: number; task?: { cancel(): void } }>());
  const inkSavedRef = useRef<SVGGElement>(null);
  const inkLiveRef = useRef<SVGGElement>(null);
  const inkCache = useRef(new Map<string, CachedStroke>());
  const holderAt = (i: number) => pagesRef.current?.children[i] as HTMLElement | undefined;
  const visible = useRef(new Set<number>());

  // Tamaño real de la primera página (las demás se ajustan al dibujarse).
  useEffect(() => {
    let alive = true;
    void content.doc.getPage(1).then((pg) => {
      const vp = pg.getViewport({ scale: 1 });
      if (alive) setRatios(Array(n).fill(vp.height / vp.width));
    });
    return () => {
      alive = false;
    };
  }, [content, n]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const currentPage = useCallback((): { page: number; fraction: number } => {
    const el = scrollRef.current;
    if (!el || !tops.current.length) return { page: 0, fraction: 0 };
    const y = el.scrollTop + el.clientHeight * 0.3;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (tops.current[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    const h = heights[lo] || 1;
    return { page: lo, fraction: clamp((el.scrollTop - tops.current[lo]) / h, 0, 0.999) };
  }, [heights, n]);

  const raf = useRef(0);
  const onScroll = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      report();
    });
  };

  const report = useCallback(() => {
    const { page, fraction } = currentPage();
    state.current.page = page;
    p.current.onLocation({ chapter: page, fraction, displayFraction: 1, page, pages: n });
    if (state.current.lastReported !== page) {
      if (state.current.lastReported >= 0) p.current.onPageTurn();
      state.current.lastReported = page;
    }
  }, [currentPage, n]);

  const scrollToPage = useCallback(
    (page: number, fraction = 0, smooth = false) => {
      const el = scrollRef.current;
      if (!el) return;
      const pg = clamp(page, 0, n - 1);
      el.scrollTo({ top: (tops.current[pg] ?? 0) + (heights[pg] ?? 0) * fraction - (fraction ? 0 : GAP / 2), behavior: smooth ? "smooth" : "auto" });
    },
    [heights, n]
  );

  // Restaurar la posición inicial una vez conocido el ancho.
  useEffect(() => {
    if (!width || state.current.restored) return;
    state.current.restored = true;
    requestAnimationFrame(() => {
      scrollToPage(props.initial.chapter, props.initial.fraction);
      report();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  // Al cambiar el zoom, conservar la página actual.
  const prevZoom = useRef(zoom);
  useEffect(() => {
    if (prevZoom.current === zoom) return;
    prevZoom.current = zoom;
    const { page, fraction } = { page: state.current.page, fraction: 0 };
    requestAnimationFrame(() => scrollToPage(page, fraction));
    for (const r of rendered.current.values()) r.scale = 0; // fuerza redibujo nítido
    scheduleRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // --- Dibujo de páginas ------------------------------------------------------
  const busy = useRef(false);
  const scheduleRender = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    const run = async () => {
      try {
        const cur = state.current.page;
        const wanted = [...visible.current].sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur));
        for (const i of wanted) {
          const holder = pagesRef.current?.children[i] as HTMLElement | undefined;
          if (!holder) continue;
          const cssW = holder.clientWidth;
          const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
          const page = await content.doc.getPage(i + 1);
          const base = page.getViewport({ scale: 1 });
          let scale = (cssW * dpr) / base.width;
          const maxPixels = 5_000_000;
          if (base.width * base.height * scale * scale > maxPixels) scale = Math.sqrt(maxPixels / (base.width * base.height));
          const existing = rendered.current.get(i);
          if (existing && Math.abs(existing.scale - scale) < 0.01) continue;
          const ratio = base.height / base.width;
          if (Math.abs(ratio - ratiosRef.current[i]) > 0.01) {
            setRatios((r) => {
              const copy = r.slice();
              copy[i] = ratio;
              return copy;
            });
          }
          const viewport = page.getViewport({ scale });
          const canvas = existing?.canvas ?? document.createElement("canvas");
          const off = document.createElement("canvas");
          off.width = Math.floor(viewport.width);
          off.height = Math.floor(viewport.height);
          const ctx = off.getContext("2d");
          if (!ctx) continue;
          const task = page.render({ canvas: off, canvasContext: ctx, viewport });
          rendered.current.set(i, { canvas, scale, task });
          try {
            await task.promise;
          } catch {
            continue;
          }
          canvas.width = off.width;
          canvas.height = off.height;
          canvas.getContext("2d")?.drawImage(off, 0, 0);
          canvas.className = "pdf-canvas";
          if (!canvas.isConnected) holder.appendChild(canvas);
          holder.classList.add("ready");
          page.cleanup();
          // Liberar las páginas lejanas para no agotar la memoria.
          if (rendered.current.size > MAX_RENDERED) {
            const far = [...rendered.current.keys()]
              .filter((k) => !visible.current.has(k))
              .sort((a, b) => Math.abs(b - cur) - Math.abs(a - cur));
            for (const k of far.slice(0, rendered.current.size - MAX_RENDERED)) {
              const r = rendered.current.get(k)!;
              r.task?.cancel();
              r.canvas.remove();
              r.canvas.width = r.canvas.height = 0;
              (pagesRef.current?.children[k] as HTMLElement | undefined)?.classList.remove("ready");
              rendered.current.delete(k);
            }
          }
        }
      } finally {
        busy.current = false;
      }
      // Si cambió lo visible mientras se dibujaba, otra pasada.
      if ([...visible.current].some((i) => !rendered.current.has(i) || rendered.current.get(i)!.scale === 0)) scheduleRender();
    };
    void run();
  }, [content]);

  useEffect(() => {
    const root = scrollRef.current;
    const holder = pagesRef.current;
    if (!root || !holder || !width) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = Number((e.target as HTMLElement).dataset.page);
          if (e.isIntersecting) visible.current.add(i);
          else visible.current.delete(i);
        }
        scheduleRender();
      },
      { root, rootMargin: "120% 0px" }
    );
    holder.querySelectorAll(".pdf-page").forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [width, n, scheduleRender]);

  useEffect(
    () => () => {
      for (const r of rendered.current.values()) r.task?.cancel();
      rendered.current.clear();
    },
    []
  );

  // --- Escritura a mano ---------------------------------------------------------
  const paintInk = () => {
    const g = inkSavedRef.current;
    const cache = inkCache.current;
    cache.clear();
    if (!g) return;
    let html = "";
    for (const d of p.current.drawings) {
      if (d.view !== "page" || d.discardedAt) continue;
      const holder = holderAt(d.chapter);
      if (!holder) continue;
      const pw = holder.clientWidth;
      for (const k of d.strokes) {
        const pts = transformPoints(k.points, holder.offsetLeft, holder.offsetTop, pw);
        const width = k.width * pw;
        const entry: CachedStroke = {
          drawingId: d.id,
          pts,
          width,
          box: padBox(bbox(pts), width / 2),
          tool: k.tool,
          color: k.color,
          straight: k.shape === "rect" || k.shape === "line",
        };
        cache.set(k.id, entry);
        html += inkPathHtml(entry);
      }
    }
    g.innerHTML = html;
  };
  const inkKey = props.drawings
    .filter((d) => d.view === "page")
    .map((d) => `${d.id}:${d.updatedAt}:${d.discardedAt ?? 0}:${d.strokes.length}`)
    .join("|");
  const layoutKey = heights.join(",");
  useLayoutEffect(() => {
    paintInk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inkKey, layoutKey]);

  const pageAtY = (y: number): number => {
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((holderAt(mid)?.offsetTop ?? 0) <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const holderBox = (i: number): Box => {
    const h = holderAt(i);
    return h ? { x: h.offsetLeft, y: h.offsetTop, w: h.clientWidth, h: h.clientHeight } : { x: 0, y: 0, w: 1, h: 1 };
  };

  const surface = (): InkSurface | null => {
    const pages = pagesRef.current;
    const scroller = scrollRef.current;
    const live = inkLiveRef.current;
    if (!pages || !scroller || !live || !width) return null;
    const origin = () => pages.getBoundingClientRect();
    const visibleBox = (): Box => {
      const o = origin();
      const v = scroller.getBoundingClientRect();
      return { x: v.left - o.left, y: v.top - o.top, w: v.width, h: v.height };
    };
    const strokesIn = (region: Box) => [...inkCache.current.values()].filter((k) => intersects(k.box, region));
    return {
      view: "page",
      toLocal: (x, y) => {
        const o = origin();
        return { x: x - o.left, y: y - o.top };
      },
      liveLayer: () => live,
      // Un "em" de tinta equivale más o menos a la letra de un libro en la página.
      emPx: () => holderBox(state.current.page).w / 28,
      anchor: (points, widthPx, center) => {
        const o = origin();
        const page = pageAtY(center.y - o.top);
        const b = holderBox(page);
        return {
          chapter: page,
          anchor: { kind: "page" },
          points: points.map((v, i) => Math.round(((v - (i % 2 ? b.y : b.x)) / b.w) * 10000) / 10000),
          width: widthPx / b.w,
        };
      },
      pageKey: (pt) => String(pageAtY(pt.y)),
      hitStroke: (pt, radius) => {
        for (const [id, k] of inkCache.current) {
          if (!intersects(k.box, { x: pt.x - radius, y: pt.y - radius, w: radius * 2, h: radius * 2 })) continue;
          if (strokeHit(k.pts, pt.x, pt.y, radius + k.width / 2)) return { drawingId: k.drawingId, strokeId: id };
        }
        return null;
      },
      drawingsInView: () => [...new Set(strokesIn(visibleBox()).map((k) => k.drawingId))],
      drawingBox: (id) => {
        let box: Box | null = null;
        for (const k of inkCache.current.values()) if (k.drawingId === id) box = unionBox(box, k.box);
        return box;
      },
      pageBox: (pt) => holderBox(pageAtY(pt.y)),
      visibleBox,
      capture: async (region, textRegion) => {
        const canvas = rasterizePdf({
          pages,
          origin: origin(),
          region,
          background: getComputedStyle(scroller).backgroundColor || "#ddd",
          scale: captureScale(),
          ink: strokesIn(region).map(toPaint),
        });
        const blob = await canvasToBlob(canvas);
        const tr = textRegion ?? region;
        const page = pageAtY(tr.y + Math.min(tr.h / 2, 20));
        const b = holderBox(page);
        const text = await pdfRegionText(content, page, { x: (tr.x - b.x) / b.w, y: (tr.y - b.y) / b.w, w: tr.w / b.w, h: tr.h / b.w });
        return { blob, text, width: Math.round(region.w), height: Math.round(region.h) };
      },
      locate: (region) => {
        const page = pageAtY(region.y + Math.min(region.h / 2, 20));
        const b = holderBox(page);
        return { chapter: page, fraction: clamp((region.y - b.y) / Math.max(1, b.h), 0, 0.99) };
      },
    };
  };

  // --- Navegación ---------------------------------------------------------------
  const next = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) p.current.onReachEnd();
    else el.scrollBy({ top: el.clientHeight - 48, behavior: settings.animation === "slide" ? "smooth" : "auto" });
  }, [settings.animation]);

  const prev = useCallback(() => {
    scrollRef.current?.scrollBy({ top: -(scrollRef.current.clientHeight - 48), behavior: settings.animation === "slide" ? "smooth" : "auto" });
  }, [settings.animation]);

  useImperativeHandle(
    ref,
    (): ViewHandle => ({
      next,
      prev,
      goTo: (t: GoTarget) => scrollToPage(t.chapter, "fraction" in t ? t.fraction ?? 0 : 0),
      nextChapter: () => {
        const cur = state.current.page;
        if (cur + 1 >= n) return false;
        scrollToPage(cur + 1);
        return true;
      },
      currentChapter: () => state.current.page,
      visibleOffset: () => null,
      blocksFromVisible: () => [],
      showElement: () => undefined,
      ink: surface,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [next, prev, scrollToPage, n, width]
  );

  // --- Gestos: toques y pellizco ------------------------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; cx: number; cy: number; scale: number } | null>(null);
  const tap = useRef<{ x: number; y: number; t: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (p.current.locked) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) tap.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (pointers.current.size === 2) {
      tap.current = null;
      const [a, b] = [...pointers.current.values()];
      const rect = scrollRef.current!.getBoundingClientRect();
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2 - rect.left, cy: (a.y + b.y) / 2 - rect.top, scale: 1 };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pz = pinch.current;
    if (pz && pointers.current.size >= 2 && pagesRef.current && scrollRef.current) {
      const [a, b] = [...pointers.current.values()];
      pz.scale = clamp(Math.hypot(a.x - b.x, a.y - b.y) / pz.dist, 1 / zoom, 4 / zoom);
      const el = scrollRef.current;
      pagesRef.current.style.transformOrigin = `${pz.cx + el.scrollLeft}px ${pz.cy + el.scrollTop}px`;
      pagesRef.current.style.transform = `scale(${pz.scale})`;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const pz = pinch.current;
    if (pz && pointers.current.size < 2) {
      pinch.current = null;
      if (pagesRef.current) pagesRef.current.style.transform = "";
      const el = scrollRef.current!;
      const newZoom = clamp(Math.round(zoom * pz.scale * 20) / 20, 1, 4);
      if (newZoom !== zoom) {
        // Mantener bajo los dedos el punto pellizcado.
        const k = newZoom / zoom;
        const left = (el.scrollLeft + pz.cx) * k - pz.cx;
        const top = (el.scrollTop + pz.cy) * k - pz.cy;
        p.current.onZoom(newZoom);
        requestAnimationFrame(() => el.scrollTo({ left, top }));
      }
      return;
    }
    const t = tap.current;
    tap.current = null;
    if (!t || performance.now() - t.t > 400 || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) return;
    if (p.current.menuOpen) return p.current.onCenterTap();
    const rect = scrollRef.current!.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    if (p.current.settings.tapZones && fx < 0.28) prev();
    else if (p.current.settings.tapZones && fx > 0.72) next();
    else p.current.onCenterTap();
  };

  return (
    <div
      ref={scrollRef}
      className="pdf-scroll"
      onScroll={onScroll}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        tap.current = null;
      }}
      style={{ ["--pdf-filter" as string]: props.pdfFilter }}
    >
      <div ref={pagesRef} className="pdf-pages" style={{ width: pageW || "100%" }}>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="pdf-page" data-page={i} style={{ height: heights[i] || 400, marginTop: GAP }}>
            <span className="pdf-num">{i + 1}</span>
          </div>
        ))}
        <svg className="ink-layer" aria-hidden="true">
          <g ref={inkSavedRef} />
          <g ref={inkLiveRef} />
        </svg>
      </div>
    </div>
  );
});
