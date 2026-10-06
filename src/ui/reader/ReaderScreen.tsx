import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Headphones,
  ListTree,
  Moon,
  Pause,
  Play,
  Search,
  Square,
  Sun,
  Type,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openBookContent } from "../../books/load";
import {
  chapterSizes,
  globalPercent,
  locationFromPercent,
  type BookContent,
  type BookMeta,
  type ReflowContent,
} from "../../books/types";
import { goBack } from "../../lib/router";
import { clamp, debounce, formatNumber, safeStorage } from "../../lib/util";
import type { Highlight, ReaderSettings } from "../../store/state";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { confirmDialog } from "../components/Dialog";
import { Sheet } from "../components/Sheet";
import { Range } from "../components/controls";
import { HighlightSheet, SelectionMenu } from "./Annotations";
import { FormatSheet } from "./FormatSheet";
import { useClockBattery, useReadingSession, useThemeColor, useWakeLock } from "./hooks";
import { PdfView } from "./PdfView";
import { ReflowView, type SelectionInfo, type ViewHandle, type ViewLocation } from "./ReflowView";
import { RsvpPlayer, type RsvpBlock, type RsvpResult } from "./RsvpPlayer";
import { SearchSheet } from "./SearchSheet";
import { readerFont, readerTheme } from "./themes";
import { TocSheet } from "./TocSheet";
import { listVoices, TtsController, ttsSupported } from "./tts";
import { Cover } from "../components/Cover";

type SheetName = null | "toc" | "format" | "search" | "end" | "tts";

export function ReaderScreen({ bookId }: { bookId: string }) {
  const book = useStore((s) => s.books[bookId]);
  const hydrated = useStore((s) => s.hydrated);
  const [content, setContent] = useState<BookContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!book) return;
    let alive = true;
    setContent(null);
    setError(null);
    openBookContent(book)
      .then((c) => alive && setContent(c))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "No se pudo abrir el libro"));
    return () => {
      alive = false;
    };
    // Solo al cambiar de libro (no en cada actualización de sus datos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id]);

  if (!hydrated) return null;
  if (!book) {
    return (
      <div className="reader-error">
        <p>Este libro ya no está en tu biblioteca.</p>
        <button className="btn btn-primary" onClick={() => goBack()}>
          Volver
        </button>
      </div>
    );
  }
  if (error) {
    return (
      <div className="reader-error">
        <div className="reader-error-cover">
          <Cover book={book} />
        </div>
        <h2 className="display">No se pudo abrir</h2>
        <p className="muted">{error}</p>
        <button className="btn btn-primary" onClick={() => goBack()}>
          Volver a la biblioteca
        </button>
      </div>
    );
  }
  if (!content) {
    return (
      <div className="reader-loading">
        <div className="reader-loading-cover">
          <Cover book={book} />
        </div>
        <div className="spinner" />
        <p className="muted">Abriendo “{book.title}”…</p>
      </div>
    );
  }
  return <Reader book={book} content={content} />;
}

function Reader({ book, content }: { book: BookMeta; content: BookContent }) {
  const settings = useStore((s) => s.reader);
  const setReader = useStore((s) => s.setReader);
  const setLocation = useStore((s) => s.setLocation);
  const updateBook = useStore((s) => s.updateBook);
  const allHighlights = useStore((s) => s.highlights);
  const allBookmarks = useStore((s) => s.bookmarks);
  const highlights = useMemo(() => allHighlights.filter((h) => h.bookId === book.id), [allHighlights, book.id]);

  const theme = readerTheme(settings.theme);
  const font = readerFont(settings.font);
  const pdfPages = content.kind === "pdf" && (book.pdfMode ?? "pages") === "pages";
  const flow: ReflowContent | null = content.kind === "pdf" ? (pdfPages ? null : content.asReflow()) : content;
  const sizes = useMemo(() => chapterSizes(content), [content]);
  const totalChapters = sizes.length;

  const viewRef = useRef<ViewHandle>(null);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheetState] = useState<SheetName>(null);
  // Al abrir un panel se ocultan los menús: al cerrarlo se vuelve a leer.
  const setSheet = (s: SheetName) => {
    if (s) setMenu(false);
    setSheetState(s);
  };
  const [loc, setLoc] = useState<ViewLocation | null>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [editing, setEditing] = useState<Highlight | null>(null);
  const [rsvp, setRsvp] = useState<{ blocks: RsvpBlock[] } | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [brightHint, setBrightHint] = useState(false);
  const [ttsState, setTtsState] = useState<{ active: boolean; playing: boolean }>({ active: false, playing: false });
  const clock = useClockBattery();

  useWakeLock(settings.keepAwake);
  useThemeColor(theme.chrome);
  const session = useReadingSession(book.id, () => ttsState.playing);

  // Al salir de la pantalla completa (si se había activado).
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    },
    []
  );

  const initial = useMemo(
    () => ({ chapter: clamp(book.location?.chapter ?? 0, 0, Math.max(0, totalChapters - 1)), fraction: book.location?.fraction ?? 0 }),
    // Posición inicial solo al montar o al cambiar el modo de PDF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book.id, book.pdfMode]
  );

  const saveLocation = useMemo(
    () => debounce((l: ViewLocation, percent: number) => setLocation(book.id, { chapter: l.chapter, fraction: l.fraction, percent }), 400),
    [book.id, setLocation]
  );
  useEffect(() => () => saveLocation.flush(), [saveLocation]);

  const percent = loc ? globalPercent(content, loc.chapter, content.kind === "pdf" && pdfPages ? loc.fraction : loc.displayFraction) : book.location?.percent ?? 0;

  const onLocation = useCallback(
    (l: ViewLocation) => {
      setLoc(l);
      const pct = globalPercent(content, l.chapter, content.kind === "pdf" && pdfPages ? l.fraction : l.displayFraction);
      saveLocation(l, pct);
    },
    [content, pdfPages, saveLocation]
  );

  // --- Marcadores ---------------------------------------------------------------
  const pageBookmark = useMemo(() => {
    if (!loc) return undefined;
    return allBookmarks.find(
      (b) => b.bookId === book.id && b.chapter === loc.chapter && Math.abs(b.fraction - loc.fraction) < 0.5 / Math.max(1, loc.pages)
    );
  }, [allBookmarks, book.id, loc]);

  const toggleBookmark = () => {
    if (!loc) return;
    const store = useStore.getState();
    if (pageBookmark) {
      store.removeBookmark(pageBookmark.id);
      toast("Marcador quitado");
      return;
    }
    let label = chapterTitle(loc.chapter);
    const blocks = viewRef.current?.blocksFromVisible() ?? [];
    if (blocks[0]?.text) label = `${chapterTitle(loc.chapter)} — “${blocks[0].text.slice(0, 80)}${blocks[0].text.length > 80 ? "…" : ""}”`;
    store.addBookmark({ bookId: book.id, chapter: loc.chapter, fraction: loc.fraction, percent, label });
    toast("Marcador guardado", { icon: "🔖" });
  };

  const chapterTitle = (c: number) => {
    if (content.kind === "pdf") {
      let title = `Página ${c + 1}`;
      for (const t of content.toc) if (t.chapter <= c) title = t.title;
      return content.toc.length ? title : `Página ${c + 1}`;
    }
    return content.chapters[c]?.title ?? "";
  };

  // --- Voz -------------------------------------------------------------------
  const ttsRef = useRef<TtsController | null>(null);
  const activeEl = useRef<HTMLElement | null>(null);
  const getTts = () => {
    if (!ttsRef.current) {
      ttsRef.current = new TtsController({
        onItem: (_i, item) => {
          activeEl.current?.classList.remove("rd-tts");
          if (item.el) {
            item.el.classList.add("rd-tts");
            activeEl.current = item.el;
            viewRef.current?.showElement(item.el);
          }
        },
        onQueueEnd: () => {
          activeEl.current?.classList.remove("rd-tts");
          if (viewRef.current?.nextChapter()) {
            setTimeout(() => startTts(), 700);
          } else setTtsState({ active: false, playing: false });
        },
        onState: (playing) => setTtsState((s) => ({ ...s, playing })),
      });
    }
    const t = ttsRef.current;
    t.rate = settings.ttsRate;
    t.voiceName = settings.ttsVoice;
    t.lang = book.language?.includes("-") ? book.language : book.language === "en" ? "en-US" : "es-ES";
    return t;
  };

  const startTts = () => {
    if (!ttsSupported()) {
      toast("Tu navegador no permite leer en voz alta", { tone: "error" });
      return;
    }
    if (pdfPages) {
      updateBook(book.id, { pdfMode: "text" });
      toast("Pasando a modo texto para escuchar…");
      setTimeout(startTts, 900);
      return;
    }
    const blocks = viewRef.current?.blocksFromVisible() ?? [];
    if (!blocks.length) {
      if (viewRef.current?.nextChapter()) setTimeout(startTts, 700);
      return;
    }
    const t = getTts();
    t.load(blocks.map((b) => ({ text: b.text, el: b.el })));
    t.play(0);
    setTtsState({ active: true, playing: true });
    setMenu(false);
  };

  const stopTts = () => {
    ttsRef.current?.stop();
    activeEl.current?.classList.remove("rd-tts");
    setTtsState({ active: false, playing: false });
  };

  useEffect(() => () => ttsRef.current?.stop(), []);
  useEffect(() => {
    const t = ttsRef.current;
    if (!t) return;
    t.rate = settings.ttsRate;
    t.voiceName = settings.ttsVoice;
    t.restart();
  }, [settings.ttsRate, settings.ttsVoice]);

  // --- Lectura rápida --------------------------------------------------------------
  const openRsvp = async () => {
    stopTts();
    setMenu(false);
    const blocks: RsvpBlock[] = [];
    if (flow && !pdfPages) {
      for (const b of viewRef.current?.blocksFromVisible() ?? []) blocks.push({ text: b.text, meta: { chapter: viewRef.current!.currentChapter(), offset: b.offset } });
      const startCh = viewRef.current?.currentChapter() ?? 0;
      for (let c = startCh + 1; c < Math.min(totalChapters, startCh + 4); c++) {
        const text = await flow.getText(c);
        const paras = text.split(/\n+/).filter((p) => p.trim());
        const total = text.length || 1;
        let acc = 0;
        for (const p of paras) {
          blocks.push({ text: p, meta: { chapter: c, fraction: acc / total } });
          acc += p.length + 1;
        }
      }
    } else if (content.kind === "pdf") {
      const start = loc?.chapter ?? 0;
      for (let pg = start; pg < Math.min(content.numPages, start + 15); pg++) {
        const text = await content.getText(pg);
        const paras = text.split(/\n+/).filter((p) => p.trim());
        const total = text.length || 1;
        let acc = 0;
        for (const p of paras) {
          blocks.push({ text: p, meta: { chapter: pg, fraction: acc / total } });
          acc += p.length + 2;
        }
      }
    }
    if (!blocks.length) {
      toast("No hay texto para la lectura rápida en esta parte", { tone: "error" });
      return;
    }
    setRsvp({ blocks });
  };

  const closeRsvp = (r: RsvpResult) => {
    const blocks = rsvp?.blocks ?? [];
    setRsvp(null);
    if (r.words > 0) {
      useStore.getState().logRsvp(r.words, r.wpm, r.ms);
      useStore.getState().logGame("rsvp", r.wpm, 0);
      toast(`${formatNumber(r.words)} palabras a ${r.wpm} ppm`, { icon: "⚡" });
    }
    const b = blocks[r.blockIndex];
    if (b?.meta && r.words > 0) {
      const m = b.meta;
      if (m.offset !== undefined) viewRef.current?.goTo({ chapter: m.chapter, offset: m.offset + r.charInBlock });
      else viewRef.current?.goTo({ chapter: m.chapter, fraction: m.fraction ?? 0 });
    }
  };

  // --- Navegación ------------------------------------------------------------------
  const goChapter = (chapter: number, anchor?: string) => {
    setSheet(null);
    setMenu(false);
    if (anchor) viewRef.current?.goTo({ chapter, anchor });
    else viewRef.current?.goTo({ chapter, fraction: 0 });
  };

  const onScrubEnd = (v: number) => {
    setScrub(null);
    if (content.kind === "pdf" && pdfPages) viewRef.current?.goTo({ chapter: Math.round(v), fraction: 0 });
    else {
      const l = locationFromPercent(sizes, v);
      viewRef.current?.goTo({ chapter: l.chapter, fraction: l.fraction });
    }
  };

  const setBrightness = (v: number) => {
    setReader({ brightness: v });
    setBrightHint(true);
  };
  useEffect(() => {
    if (!brightHint) return;
    const t = setTimeout(() => setBrightHint(false), 900);
    return () => clearTimeout(t);
  }, [brightHint, settings.brightness]);

  const toggleNight = () => {
    if (theme.dark) {
      safeStorage.set("campanita-night-theme", settings.theme);
      setReader({ theme: (safeStorage.get("campanita-day-theme") as ReaderSettings["theme"]) || "paper" });
    } else {
      safeStorage.set("campanita-day-theme", settings.theme);
      setReader({ theme: (safeStorage.get("campanita-night-theme") as ReaderSettings["theme"]) || "night" });
    }
  };

  const onReachEnd = () => {
    if (book.status !== "finished") setSheet("end");
    else toast("Llegaste al final del libro", { icon: "🏁" });
  };

  const setPdfMode = (mode: "pages" | "text") => {
    if (loc) setLocation(book.id, { chapter: loc.chapter, fraction: 0, percent });
    updateBook(book.id, { pdfMode: mode });
  };

  const cssVars = {
    ["--rd-bg" as string]: theme.bg,
    ["--rd-fg" as string]: theme.fg,
    ["--rd-muted" as string]: theme.muted,
    ["--rd-link" as string]: theme.link,
    ["--rd-font" as string]: font.css,
    ["--rd-size" as string]: `${settings.fontSize}px`,
    ["--rd-lh" as string]: settings.lineHeight,
    ["--rd-align" as string]: settings.align,
    ["--rd-pspace" as string]: `${settings.paragraphSpacing}em`,
    ["--rd-indent" as string]: settings.indent ? "1.4em" : "0",
    ["--rd-hyphens" as string]: settings.hyphenate ? "auto" : "manual",
  };

  const pageLabel = loc
    ? content.kind === "pdf" && pdfPages
      ? `Pág. ${loc.chapter + 1} de ${content.numPages}`
      : settings.mode === "paged" || flow?.fixedLayout
        ? `${loc.page + 1} / ${loc.pages}`
        : ""
    : "";

  const scrubValue = scrub ?? (content.kind === "pdf" && pdfPages ? loc?.chapter ?? 0 : percent);
  const scrubLabel =
    content.kind === "pdf" && pdfPages
      ? `Página ${Math.round(scrubValue) + 1}`
      : `${chapterTitle(locationFromPercent(sizes, scrubValue).chapter)} · ${Math.round(scrubValue * 100)}%`;

  return (
    <div className={`reader ${theme.dark ? "dark" : "light"} ${settings.showStatus ? "with-status" : ""}`} style={cssVars}>
      {settings.showStatus && (
        <div className="rd-status top">
          <span className="ellipsis">{loc ? chapterTitle(loc.chapter) : book.title}</span>
        </div>
      )}

      {pdfPages && content.kind === "pdf" ? (
        <PdfView
          key={`pdf-${book.id}`}
          ref={viewRef}
          content={content}
          settings={settings}
          initial={initial}
          pdfFilter={theme.pdfFilter}
          menuOpen={menu}
          onLocation={onLocation}
          onCenterTap={() => setMenu((m) => !m)}
          onPageTurn={session.pageTurned}
          onReachEnd={onReachEnd}
          onZoom={(z) => setReader({ pdfZoom: z })}
        />
      ) : flow ? (
        <ReflowView
          key={`flow-${book.id}-${book.pdfMode ?? ""}`}
          ref={viewRef}
          content={flow}
          settings={settings}
          initial={initial}
          highlights={highlights}
          menuOpen={menu}
          onLocation={onLocation}
          onCenterTap={() => {
            setSelection(null);
            setMenu((m) => !m);
          }}
          onPageTurn={session.pageTurned}
          onReachEnd={onReachEnd}
          onHighlightTap={(id) => setEditing(highlights.find((h) => h.id === id) ?? null)}
          onSelection={(s) => {
            setSelection(s);
            if (s) setMenu(false);
          }}
          onBrightness={setBrightness}
          onExternalLink={async (href) => {
            if (await confirmDialog("¿Abrir enlace externo?", href, "Abrir")) window.open(href, "_blank", "noopener");
          }}
        />
      ) : null}

      {settings.showStatus && (
        <div className="rd-status bottom">
          <span>{pageLabel}</span>
          <span className="rd-clock">
            {clock.time}
            {clock.battery !== null && <span className="rd-batt"> · {clock.battery}%</span>}
          </span>
          <span>{(percent * 100).toFixed(percent < 0.1 ? 1 : 0)}%</span>
        </div>
      )}

      {pageBookmark && <div className="rd-ribbon" aria-label="Página con marcador" />}

      {/* Brillo */}
      <div className="rd-dim" style={{ opacity: 1 - settings.brightness }} />
      {brightHint && (
        <div className="bright-hint">
          <Sun size={18} /> {Math.round(settings.brightness * 100)}%
        </div>
      )}

      {/* Menús */}
      <div className={`rd-top ${menu ? "show" : ""}`}>
        <button className="icon-btn" onClick={() => goBack()} aria-label="Volver a la biblioteca">
          <ArrowLeft size={23} />
        </button>
        <div className="rd-top-title">
          <div className="ellipsis rd-top-book">{book.title}</div>
          {book.author && <div className="ellipsis rd-top-author">{book.author}</div>}
        </div>
        <button className="icon-btn" onClick={() => setSheet("search")} aria-label="Buscar">
          <Search size={21} />
        </button>
        <button className={`icon-btn ${pageBookmark ? "active" : ""}`} onClick={toggleBookmark} aria-label="Marcador">
          <Bookmark size={21} fill={pageBookmark ? "currentColor" : "none"} />
        </button>
      </div>

      <div className={`rd-bottom ${menu ? "show" : ""}`}>
        <div className="rd-scrub">
          <button
            className="icon-btn"
            aria-label="Capítulo anterior"
            disabled={!loc || loc.chapter === 0}
            onClick={() => loc && viewRef.current?.goTo({ chapter: loc.chapter - 1, fraction: 0 })}
          >
            <ChevronLeft size={22} />
          </button>
          <div className="rd-scrub-track">
            {scrub !== null && <div className="rd-scrub-bubble">{scrubLabel}</div>}
            {content.kind === "pdf" && pdfPages ? (
              <Range
                value={scrubValue}
                min={0}
                max={Math.max(1, content.numPages - 1)}
                onChange={(v) => setScrub(v)}
                label="Ir a la página"
              />
            ) : (
              <Range value={scrubValue} min={0} max={1} step={0.001} onChange={(v) => setScrub(v)} label="Avance del libro" />
            )}
          </div>
          <button
            className="icon-btn"
            aria-label="Capítulo siguiente"
            disabled={!loc || loc.chapter >= totalChapters - 1}
            onClick={() => loc && viewRef.current?.goTo({ chapter: loc.chapter + 1, fraction: 0 })}
          >
            <ChevronRight size={22} />
          </button>
        </div>
        {scrub !== null && (
          <ScrubCommit onCommit={() => onScrubEnd(scrub)} />
        )}
        <div className="rd-actions">
          <button className="rd-action" onClick={() => setSheet("toc")}>
            <ListTree size={22} />
            <span>Índice</span>
          </button>
          <button className="rd-action" onClick={() => setSheet("format")}>
            <Type size={22} />
            <span>Aspecto</span>
          </button>
          <button className="rd-action" onClick={toggleNight}>
            {theme.dark ? <Sun size={22} /> : <Moon size={22} />}
            <span>{theme.dark ? "Día" : "Noche"}</span>
          </button>
          <button className="rd-action" onClick={() => (ttsState.active ? setSheet("tts") : startTts())}>
            <Headphones size={22} />
            <span>Escuchar</span>
          </button>
          <button className="rd-action" onClick={() => void openRsvp()} disabled={!!flow?.fixedLayout}>
            <Zap size={22} />
            <span>Rápida</span>
          </button>
        </div>
      </div>

      {ttsState.active && !menu && (
        <div className="tts-bar">
          <button className="icon-btn" onClick={() => (ttsState.playing ? ttsRef.current?.pause() : ttsRef.current?.play())} aria-label={ttsState.playing ? "Pausa" : "Seguir"}>
            {ttsState.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button className="tts-label" onClick={() => setSheet("tts")}>
            <Headphones size={16} /> Leyendo en voz alta · {settings.ttsRate.toFixed(2).replace(/0$/, "")}×
          </button>
          <button className="icon-btn" onClick={stopTts} aria-label="Detener">
            <Square size={17} fill="currentColor" />
          </button>
        </div>
      )}

      {selection && !menu && (
        <SelectionMenu
          sel={selection}
          bookId={book.id}
          bookTitle={book.title}
          onDone={() => setSelection(null)}
          onEditHighlight={(h) => setEditing(h)}
        />
      )}

      <TocSheet
        open={sheet === "toc"}
        onClose={() => setSheet(null)}
        book={book}
        content={pdfPages ? content : flow ?? content}
        currentChapter={loc?.chapter ?? 0}
        onGoChapter={goChapter}
        onGoBookmark={(b) => {
          setSheet(null);
          setMenu(false);
          viewRef.current?.goTo({ chapter: b.chapter, fraction: b.fraction });
        }}
        onGoHighlight={(h) => {
          setSheet(null);
          setMenu(false);
          if (pdfPages) viewRef.current?.goTo({ chapter: h.chapter, fraction: 0 });
          else viewRef.current?.goTo({ chapter: h.chapter, offset: h.start, flash: 0 });
        }}
        onEditHighlight={(h) => {
          setSheet(null);
          setEditing(h);
        }}
      />

      <FormatSheet
        open={sheet === "format"}
        onClose={() => setSheet(null)}
        settings={settings}
        onChange={setReader}
        book={book}
        onPdfMode={setPdfMode}
        fixedLayout={!!flow?.fixedLayout}
      />

      <SearchSheet
        open={sheet === "search"}
        onClose={() => setSheet(null)}
        content={content}
        pdfPages={pdfPages}
        onGo={(r) => {
          setSheet(null);
          setMenu(false);
          if (pdfPages) viewRef.current?.goTo({ chapter: r.chapter, fraction: 0 });
          else viewRef.current?.goTo({ chapter: r.chapter, offset: r.index, flash: r.length });
        }}
      />

      <TtsSheet open={sheet === "tts"} onClose={() => setSheet(null)} settings={settings} onChange={setReader} lang={book.language} onStop={() => {
        stopTts();
        setSheet(null);
      }} />

      <HighlightSheet highlight={editing} bookTitle={book.title} onClose={() => setEditing(null)} />

      <Sheet open={sheet === "end"} onClose={() => setSheet(null)}>
        <div className="end-sheet">
          <div className="end-emoji">🏁</div>
          <h2 className="display">¡Llegaste al final!</h2>
          <p className="muted">
            Terminaste <b>{book.title}</b>. ¿Lo marcamos como terminado? Ganarás 100 ✨ de polvo de hadas.
          </p>
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              useStore.getState().setFinished(book.id, true);
              setSheet(null);
            }}
          >
            Marcar como terminado
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => setSheet(null)}>
            Ahora no
          </button>
        </div>
      </Sheet>

      {rsvp && (
        <RsvpPlayer
          blocks={rsvp.blocks}
          title={book.title}
          wpm={settings.rsvpWpm}
          chunk={settings.rsvpChunk}
          onSettings={(s) => setReader({ ...(s.wpm ? { rsvpWpm: s.wpm } : {}), ...(s.chunk ? { rsvpChunk: s.chunk } : {}) })}
          onExit={closeRsvp}
        />
      )}
    </div>
  );
}

/** Aplica el salto del deslizador al soltarlo. */
function ScrubCommit({ onCommit }: { onCommit: () => void }) {
  const cb = useRef(onCommit);
  cb.current = onCommit;
  useEffect(() => {
    const up = () => cb.current();
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("touchend", up, { once: true });
    window.addEventListener("keyup", up, { once: true });
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("touchend", up);
      window.removeEventListener("keyup", up);
    };
  }, []);
  return null;
}

function TtsSheet({
  open,
  onClose,
  settings,
  onChange,
  lang,
  onStop,
}: {
  open: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onChange: (p: Partial<ReaderSettings>) => void;
  lang?: string;
  onStop: () => void;
}) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!ttsSupported()) return;
    const load = () => setVoices(listVoices(lang ?? "es"));
    load();
    speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => speechSynthesis.removeEventListener?.("voiceschanged", load);
  }, [lang]);
  return (
    <Sheet open={open} onClose={onClose} title="Lectura en voz alta">
      <div className="label">Velocidad · {settings.ttsRate.toFixed(2)}×</div>
      <Range value={settings.ttsRate} min={0.5} max={2.5} step={0.05} onChange={(v) => onChange({ ttsRate: v })} label="Velocidad de voz" />
      <div className="label">Voz</div>
      <div className="list voice-list">
        <button className="list-item" onClick={() => onChange({ ttsVoice: "" })}>
          <span className="li-main li-title">Automática</span>
          {!settings.ttsVoice && <span className="accent-dot" />}
        </button>
        {voices.map((v) => (
          <button key={v.name} className="list-item" onClick={() => onChange({ ttsVoice: v.name })}>
            <span className="li-main">
              <div className="li-title">{v.name}</div>
              <div className="li-sub">
                {v.lang}
                {v.localService ? " · sin conexión" : ""}
              </div>
            </span>
            {settings.ttsVoice === v.name && <span className="accent-dot" />}
          </button>
        ))}
      </div>
      <button className="btn btn-danger btn-block" style={{ marginTop: 16 }} onClick={onStop}>
        <Square size={16} fill="currentColor" /> Detener lectura
      </button>
    </Sheet>
  );
}
