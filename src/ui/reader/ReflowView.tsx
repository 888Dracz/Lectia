// Vista de lectura para texto adaptable (EPUB, Word, TXT, PDF en modo texto…).
// Pagina el capítulo con columnas CSS (una columna = una página) o lo muestra
// con desplazamiento vertical. Gestiona gestos, subrayados y selección.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { ReflowContent } from "../../books/types";
import { clamp } from "../../lib/util";
import type { Highlight, ReaderSettings } from "../../store/state";
import { offsetOf, pointAt, rangeFromOffsets, readingBlocks, textNodes, unwrapMarks, wrapOffsets } from "./dom";

export interface ViewLocation {
  chapter: number;
  /** Inicio de la página visible dentro del capítulo (0–1), para guardar. */
  fraction: number;
  /** Final de la página visible (0–1), para mostrar el avance. */
  displayFraction: number;
  page: number;
  pages: number;
}

export type GoTarget =
  | { chapter: number; fraction?: number }
  | { chapter: number; offset: number; flash?: number }
  | { chapter: number; anchor: string }
  | { chapter: number; end: true };

export interface SelectionInfo {
  chapter: number;
  start: number;
  end: number;
  text: string;
  rect: { top: number; bottom: number; left: number; right: number };
}

export interface ReadingBlock {
  el: HTMLElement;
  offset: number;
  text: string;
}

export interface ViewHandle {
  next(): void;
  prev(): void;
  goTo(t: GoTarget): void;
  visibleOffset(): { chapter: number; offset: number } | null;
  blocksFromVisible(): ReadingBlock[];
  showElement(el: HTMLElement): void;
  nextChapter(): boolean;
  currentChapter(): number;
}

interface Props {
  content: ReflowContent;
  settings: ReaderSettings;
  initial: { chapter: number; fraction: number };
  highlights: Highlight[];
  menuOpen: boolean;
  onLocation: (l: ViewLocation) => void;
  onCenterTap: () => void;
  onPageTurn: () => void;
  onReachEnd: () => void;
  onHighlightTap: (id: string) => void;
  onSelection: (s: SelectionInfo | null) => void;
  onBrightness: (v: number) => void;
  onExternalLink: (href: string) => void;
}

type Target =
  | { kind: "fraction"; value: number }
  | { kind: "end" }
  | { kind: "offset"; value: number; flash?: number }
  | { kind: "anchor"; value: string };

function toTarget(t: GoTarget): Target {
  if ("end" in t) return { kind: "end" };
  if ("offset" in t) return { kind: "offset", value: t.offset, flash: t.flash };
  if ("anchor" in t) return { kind: "anchor", value: t.anchor };
  return { kind: "fraction", value: t.fraction ?? 0 };
}

export const ReflowView = forwardRef<ViewHandle, Props>(function ReflowView(props, ref) {
  const { content, settings } = props;
  const p = useRef(props);
  p.current = props;

  const paged = settings.mode === "paged" || !!content.fixedLayout;
  const viewRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const st = useRef({
    chapter: props.initial.chapter,
    page: 0,
    pages: 1,
    W: 0,
    H: 0,
    paged,
    rendered: -1,
    target: { kind: "fraction", value: props.initial.fraction } as Target | null,
  });

  const [request, setRequest] = useState(props.initial.chapter);
  const [loaded, setLoaded] = useState<{ chapter: number; html: string } | null>(null);

  // --- Carga de capítulos --------------------------------------------------
  useEffect(() => {
    let alive = true;
    void content.getHtml(request).then((html) => {
      if (!alive) return;
      st.current.chapter = request;
      setLoaded({ chapter: request, html });
      // Precarga el siguiente para pasar de capítulo sin esperas.
      if (request + 1 < content.chapters.length) void content.getHtml(request + 1);
    });
    return () => {
      alive = false;
    };
  }, [content, request]);

  const requestChapter = useCallback(
    (chapter: number, target: Target) => {
      const c = clamp(chapter, 0, content.chapters.length - 1);
      st.current.target = target;
      if (c === st.current.chapter && loaded?.chapter === c) {
        layoutRef.current();
      } else {
        if (contentRef.current) contentRef.current.style.opacity = "0";
        setRequest(c);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [content, loaded]
  );

  // --- Medición y posición ---------------------------------------------------
  const report = useCallback(() => {
    const s = st.current;
    const vp = viewportRef.current;
    if (!vp || s.rendered < 0) return;
    if (s.paged) {
      p.current.onLocation({
        chapter: s.chapter,
        fraction: s.pages ? s.page / s.pages : 0,
        displayFraction: s.pages ? (s.page + 1) / s.pages : 1,
        page: s.page,
        pages: s.pages,
      });
    } else {
      const max = Math.max(1, vp.scrollHeight - vp.clientHeight);
      const f = clamp(vp.scrollTop / max, 0, 1);
      const pages = Math.max(1, Math.ceil(vp.scrollHeight / Math.max(1, vp.clientHeight)));
      p.current.onLocation({
        chapter: s.chapter,
        fraction: vp.scrollHeight <= vp.clientHeight ? 0 : f,
        displayFraction: vp.scrollHeight <= vp.clientHeight ? 1 : clamp((vp.scrollTop + vp.clientHeight) / vp.scrollHeight, 0, 1),
        page: Math.min(pages - 1, Math.floor(vp.scrollTop / Math.max(1, vp.clientHeight))),
        pages,
      });
    }
  }, []);

  const setPage = useCallback(
    (page: number, animate: boolean) => {
      const s = st.current;
      const cols = colsRef.current;
      if (!cols) return;
      s.page = clamp(page, 0, s.pages - 1);
      cols.style.transition = animate && p.current.settings.animation === "slide" ? "transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)" : "none";
      cols.style.transform = `translate3d(${-s.page * s.W}px, 0, 0)`;
      report();
    },
    [report]
  );

  const pageOfX = (x: number) => {
    const s = st.current;
    const base = colsRef.current!.getBoundingClientRect().left;
    return clamp(Math.floor((x - base + 1) / Math.max(1, s.W)), 0, s.pages - 1);
  };

  const rectOfOffset = (offset: number): DOMRect | null => {
    const el = contentRef.current;
    if (!el) return null;
    const pt = pointAt(el, offset);
    if (!pt) return null;
    const r = document.createRange();
    r.setStart(pt.node, pt.offset);
    r.setEnd(pt.node, Math.min(pt.node.data.length, pt.offset + 1));
    const rects = r.getClientRects();
    return rects[0] ?? r.getBoundingClientRect();
  };

  const flash = (offset: number, length: number) => {
    const el = contentRef.current;
    if (!el || length <= 0) return;
    wrapOffsets(el, offset, offset + length, () => {
      const m = document.createElement("mark");
      m.className = "rd-flash";
      return m;
    });
    setTimeout(() => unwrapMarks(el, ".rd-flash"), 2200);
  };

  const layout = useCallback(() => {
    const s = st.current;
    const vp = viewportRef.current;
    const cols = colsRef.current;
    const el = contentRef.current;
    const view = viewRef.current;
    if (!vp || !cols || !el || !view || s.rendered < 0) return;

    // Posición actual (con el modo anterior) para conservarla si no hay destino.
    let current = 0;
    if (s.paged) current = s.pages ? s.page / s.pages : 0;
    else current = vp.scrollHeight > vp.clientHeight ? vp.scrollTop / (vp.scrollHeight - vp.clientHeight) : 0;
    const target = s.target ?? { kind: "fraction", value: current };
    s.target = null;

    const isPaged = p.current.settings.mode === "paged" || !!content.fixedLayout;
    s.paged = isPaged;
    const W = vp.clientWidth;
    const H = vp.clientHeight;
    s.W = W;
    s.H = H;
    const m = content.fixedLayout ? 0 : Math.min(p.current.settings.margin, W / 4);
    view.style.setProperty("--page-h", `${H}px`);

    if (isPaged) {
      vp.scrollTop = 0;
      cols.style.width = `${W}px`;
      cols.style.height = `${H}px`;
      cols.style.columnWidth = `${W - 2 * m}px`;
      cols.style.columnGap = `${2 * m}px`;
      cols.style.padding = `0 ${m}px`;
      const end = el.querySelector(".rd-end");
      const base = cols.getBoundingClientRect().left;
      const endX = end ? end.getBoundingClientRect().left - base : 0;
      s.pages = Math.max(1, Math.floor((endX - 1) / W) + 1);
      let page = 0;
      if (target.kind === "fraction") page = Math.round(target.value * s.pages);
      else if (target.kind === "end") page = s.pages - 1;
      else if (target.kind === "offset") {
        const r = rectOfOffset(target.value);
        page = r ? Math.floor((r.left - base + 1) / W) : 0;
      } else if (target.kind === "anchor") {
        const a = el.querySelector(`[id="${CSS.escape(target.value)}"]`);
        const r = a?.getClientRects()[0] ?? a?.getBoundingClientRect();
        page = r ? Math.floor((r.left - base + 1) / W) : 0;
      }
      setPage(clamp(page, 0, s.pages - 1), false);
    } else {
      cols.style.width = "";
      cols.style.height = "";
      cols.style.columnWidth = "";
      cols.style.columnGap = "";
      cols.style.transform = "";
      cols.style.transition = "";
      cols.style.padding = `0 ${m}px`;
      const max = Math.max(0, vp.scrollHeight - vp.clientHeight);
      let top = 0;
      if (target.kind === "fraction") top = target.value * max;
      else if (target.kind === "end") top = max;
      else {
        let r: DOMRect | null | undefined = null;
        if (target.kind === "offset") r = rectOfOffset(target.value);
        else {
          const a = el.querySelector(`[id="${CSS.escape(target.value)}"]`);
          r = a?.getBoundingClientRect();
        }
        if (r) top = r.top - vp.getBoundingClientRect().top + vp.scrollTop - H * 0.25;
      }
      vp.scrollTop = clamp(top, 0, max);
      report();
    }
    if (target.kind === "offset" && target.flash) flash(target.value, target.flash);
    el.style.opacity = "1";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, report, setPage]);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // --- Pintado del capítulo y subrayados -------------------------------------
  const chapterHighlights = loaded ? props.highlights.filter((h) => h.chapter === loaded.chapter) : [];
  const hlKey = chapterHighlights.map((h) => `${h.id}:${h.color}:${h.start}:${h.end}:${h.note ? 1 : 0}`).join("|");

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!loaded || !el) return;
    const s = st.current;
    // Sin destino pendiente, layout() conserva la posición actual (p. ej. al subrayar).
    el.innerHTML = `${loaded.html}<div class="rd-end" aria-hidden="true"></div>`;
    const sorted = [...chapterHighlights].sort((a, b) => a.start - b.start);
    for (const h of sorted) {
      wrapOffsets(el, h.start, h.end, () => {
        const m = document.createElement("mark");
        m.dataset.hl = h.id;
        m.dataset.c = h.color;
        if (h.note) m.dataset.note = "1";
        return m;
      });
    }
    s.rendered = loaded.chapter;
    layout();
    // Las imágenes cambian el tamaño al cargar: volver a paginar.
    const imgs = Array.from(el.querySelectorAll("img")).filter((i) => !i.complete);
    let pending = imgs.length;
    const done = () => {
      if (--pending === 0 && contentRef.current === el) layoutRef.current();
    };
    imgs.forEach((img) => {
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, hlKey]);

  // Cambios de formato → repaginar conservando la posición.
  const s0 = settings;
  useLayoutEffect(() => {
    layout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s0.mode, s0.font, s0.fontSize, s0.lineHeight, s0.margin, s0.align, s0.paragraphSpacing, s0.indent, s0.hyphenate, s0.showStatus]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      if (t) clearTimeout(t);
      t = setTimeout(() => layoutRef.current(), 120);
    });
    ro.observe(vp);
    const onFonts = () => layoutRef.current();
    document.fonts?.addEventListener?.("loadingdone", onFonts);
    return () => {
      ro.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", onFonts);
    };
  }, []);

  // --- Navegación ------------------------------------------------------------
  const nextChapter = useCallback((): boolean => {
    const s = st.current;
    if (s.chapter + 1 < content.chapters.length) {
      requestChapter(s.chapter + 1, { kind: "fraction", value: 0 });
      p.current.onPageTurn();
      return true;
    }
    p.current.onReachEnd();
    return false;
  }, [content, requestChapter]);

  const next = useCallback(() => {
    const s = st.current;
    const vp = viewportRef.current;
    if (!vp) return;
    if (s.paged) {
      if (s.page < s.pages - 1) {
        setPage(s.page + 1, true);
        p.current.onPageTurn();
      } else nextChapter();
    } else {
      const max = vp.scrollHeight - vp.clientHeight;
      if (vp.scrollTop >= max - 4) nextChapter();
      else {
        vp.scrollBy({ top: vp.clientHeight * 0.9, behavior: p.current.settings.animation === "slide" ? "smooth" : "auto" });
        p.current.onPageTurn();
      }
    }
  }, [nextChapter, setPage]);

  const prev = useCallback(() => {
    const s = st.current;
    const vp = viewportRef.current;
    if (!vp) return;
    if (s.paged) {
      if (s.page > 0) {
        setPage(s.page - 1, true);
        p.current.onPageTurn();
      } else if (s.chapter > 0) requestChapter(s.chapter - 1, { kind: "end" });
      else setPage(0, true);
    } else {
      if (vp.scrollTop <= 4) {
        if (s.chapter > 0) requestChapter(s.chapter - 1, { kind: "end" });
      } else vp.scrollBy({ top: -vp.clientHeight * 0.9, behavior: p.current.settings.animation === "slide" ? "smooth" : "auto" });
    }
  }, [requestChapter, setPage]);

  const isVisibleRect = (r: DOMRect) => {
    const s = st.current;
    const vp = viewportRef.current!;
    if (s.paged) return pageOfX(r.left) >= s.page;
    return r.bottom > vp.getBoundingClientRect().top + 4;
  };

  useImperativeHandle(
    ref,
    (): ViewHandle => ({
      next,
      prev,
      goTo: (t) => requestChapter(t.chapter, toTarget(t)),
      nextChapter,
      currentChapter: () => st.current.chapter,
      visibleOffset: () => {
        const el = contentRef.current;
        if (!el) return null;
        const nodes = textNodes(el).filter((n) => n.data.trim());
        // Búsqueda binaria del primer nodo de texto visible.
        let lo = 0;
        let hi = nodes.length - 1;
        let found = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const r = document.createRange();
          r.selectNodeContents(nodes[mid]);
          const rects = r.getClientRects();
          const last = rects[rects.length - 1];
          if (last && isVisibleRect(last)) {
            found = mid;
            hi = mid - 1;
          } else lo = mid + 1;
        }
        if (found < 0) return { chapter: st.current.chapter, offset: 0 };
        return { chapter: st.current.chapter, offset: offsetOf(el, nodes[found], 0) };
      },
      blocksFromVisible: () => {
        const el = contentRef.current;
        if (!el) return [];
        const blocks = readingBlocks(el);
        const startIdx = blocks.findIndex((b) => {
          const rects = b.getClientRects();
          const last = rects[rects.length - 1];
          return last && isVisibleRect(last);
        });
        return blocks.slice(Math.max(0, startIdx)).map((b) => ({
          el: b,
          offset: offsetOf(el, b, 0),
          text: (b.textContent ?? "").replace(/\s+/g, " ").trim(),
        }));
      },
      showElement: (target) => {
        const s = st.current;
        const vp = viewportRef.current;
        if (!vp || !target.isConnected) return;
        const r = target.getClientRects()[0] ?? target.getBoundingClientRect();
        if (s.paged) {
          const pg = pageOfX(r.left);
          if (pg !== s.page) setPage(pg, true);
        } else {
          const vr = vp.getBoundingClientRect();
          if (r.top < vr.top || r.bottom > vr.bottom - 20) {
            vp.scrollTo({ top: vp.scrollTop + r.top - vr.top - vr.height * 0.2, behavior: "smooth" });
          }
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [next, prev, nextChapter, requestChapter, setPage]
  );

  // --- Gestos ----------------------------------------------------------------
  const gesture = useRef<{
    x: number;
    y: number;
    t: number;
    mode: "pending" | "none" | "drag" | "bright";
    edge: boolean;
    bright: number;
    pointerType: string;
    target: EventTarget | null;
  } | null>(null);

  const hasSelection = () => {
    const sel = window.getSelection();
    return !!sel && !sel.isCollapsed && sel.toString().trim().length > 0;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const rect = viewRef.current!.getBoundingClientRect();
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      mode: "pending",
      edge: e.pointerType !== "mouse" && e.clientX - rect.left < Math.max(28, rect.width * 0.09),
      bright: p.current.settings.brightness,
      pointerType: e.pointerType,
      target: e.target,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const s = st.current;
    if (g.mode === "pending") {
      if (g.edge && Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.2) g.mode = "bright";
      else if (s.paged && g.pointerType !== "mouse" && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) && !hasSelection()) g.mode = "drag";
      else if (Math.hypot(dx, dy) > 12) g.mode = "none";
    }
    if (g.mode === "bright") {
      p.current.onBrightness(clamp(g.bright - dy / (s.H * 0.7 || 500), 0.15, 1));
    } else if (g.mode === "drag" && p.current.settings.animation === "slide" && colsRef.current) {
      let off = dx;
      if ((s.page === 0 && s.chapter === 0 && dx > 0) || (s.page === s.pages - 1 && s.chapter === content.chapters.length - 1 && dx < 0)) off = dx / 3;
      colsRef.current.style.transition = "none";
      colsRef.current.style.transform = `translate3d(${-s.page * s.W + off}px, 0, 0)`;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const dt = performance.now() - g.t;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.mode === "bright") return;
    if (g.mode === "drag") {
      const fast = Math.abs(dx) / Math.max(1, dt) > 0.45;
      if (Math.abs(dx) > st.current.W * 0.16 || (fast && Math.abs(dx) > 30)) {
        if (dx < 0) next();
        else prev();
      } else setPage(st.current.page, true);
      return;
    }
    if (g.mode !== "pending" || dt > 450 || Math.hypot(dx, dy) > 12) return;
    // Toque
    if (hasSelection()) return;
    if (p.current.menuOpen) {
      p.current.onCenterTap();
      return;
    }
    const target = g.target as Element | null;
    const link = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (link && contentRef.current?.contains(link)) {
      const href = link.getAttribute("href") ?? "";
      if (/^(https?:|mailto:)/i.test(href)) p.current.onExternalLink(href);
      else {
        const dest = content.resolveHref?.(href, st.current.chapter);
        if (dest) requestChapter(dest.chapter, dest.anchor ? { kind: "anchor", value: dest.anchor } : { kind: "fraction", value: 0 });
      }
      return;
    }
    const mark = target?.closest?.("mark[data-hl]") as HTMLElement | null;
    if (mark?.dataset.hl) {
      p.current.onHighlightTap(mark.dataset.hl);
      return;
    }
    const rect = viewRef.current!.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    if (p.current.settings.tapZones && fx < 0.3) prev();
    else if (p.current.settings.tapZones && fx > 0.7) next();
    else p.current.onCenterTap();
  };

  // Teclado (útil en tabletas con teclado o en la computadora).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector(".sheet, .dialog, .rsvp")) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key) || (st.current.paged && e.key === "ArrowDown")) {
        e.preventDefault();
        next();
      } else if (["ArrowLeft", "PageUp"].includes(e.key) || (st.current.paged && e.key === "ArrowUp")) {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  // Selección de texto → menú de subrayado.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const onSel = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const el = contentRef.current;
        const sel = window.getSelection();
        if (!el || !sel || sel.isCollapsed || !sel.rangeCount) return p.current.onSelection(null);
        const r = sel.getRangeAt(0);
        if (!el.contains(r.commonAncestorContainer)) return p.current.onSelection(null);
        const text = r.toString();
        if (!text.trim()) return p.current.onSelection(null);
        const start = offsetOf(el, r.startContainer, r.startOffset);
        const box = r.getBoundingClientRect();
        p.current.onSelection({
          chapter: st.current.chapter,
          start,
          end: start + text.length,
          text: text.trim(),
          rect: { top: box.top, bottom: box.bottom, left: box.left, right: box.right },
        });
      }, 220);
    };
    document.addEventListener("selectionchange", onSel);
    return () => {
      document.removeEventListener("selectionchange", onSel);
      if (t) clearTimeout(t);
    };
  }, []);

  const onScroll = () => {
    const vp = viewportRef.current;
    if (!vp) return;
    if (st.current.paged) {
      // La selección puede desplazar el contenedor: se corrige.
      if (vp.scrollLeft || vp.scrollTop) {
        vp.scrollLeft = 0;
        vp.scrollTop = 0;
      }
      return;
    }
    report();
  };

  return (
    <div
      ref={viewRef}
      className={`rd-view ${paged ? "paged" : "scroll"} ${content.fixedLayout ? "fixed" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        const g = gesture.current;
        gesture.current = null;
        if (g?.mode === "drag") setPage(st.current.page, true);
      }}
    >
      <div ref={viewportRef} className="rd-viewport" onScroll={onScroll}>
        <div ref={colsRef} className="rd-columns">
          <div
            ref={contentRef}
            className="rd-content"
            lang="es"
            onClick={(e) => {
              if ((e.target as Element).closest("a")) e.preventDefault();
            }}
          />
        </div>
      </div>
      {!loaded && (
        <div className="rd-loading">
          <div className="spinner" />
        </div>
      )}
    </div>
  );
});

/** Rango de un subrayado ya pintado (para posicionar menús). */
export function highlightRange(root: Element, h: Highlight): Range | null {
  return rangeFromOffsets(root, h.start, h.end);
}
