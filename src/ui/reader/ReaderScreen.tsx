import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileCode,
  Crop,
  Headphones,
  Info,
  ListTree,
  Moon,
  NotebookText,
  Pause,
  PenLine,
  Play,
  ScreenShare,
  Search,
  Square,
  Sun,
  TextCursorInput,
  Type,
  ALargeSmall,
  ArrowDownWideNarrow,
  SkipBack,
  SkipForward,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setEngineOptions, engineKey } from "../../books/html";
import { createPortal } from "react-dom";
import { openBookContent } from "../../books/load";
import {
  chapterSizes,
  globalPercent,
  locationFromPercent,
  type BookContent,
  type BookMeta,
  type ReflowContent,
} from "../../books/types";
import { goBack, navigate, useBackClose } from "../../lib/router";
import { formatMinutes, minutesFor, readingWpm, remainingWords } from "../../lib/stats";
import { clamp, debounce, formatNumber, safeStorage } from "../../lib/util";
import type { Clip, Highlight, ReaderSettings, ToolId } from "../../store/state";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { confirmDialog } from "../components/Dialog";
import { Sheet } from "../components/Sheet";
import { Range } from "../components/controls";
import { HighlightSheet, SelectionMenu } from "./Annotations";
import { CropTool } from "./CropTool";
import { DrawMode } from "./DrawMode";
import { takePendingJump } from "./jump";
import { NotebookView } from "../notebook/NotebookView";
import { PhotoSheet } from "../notebook/NotebookSheets";
import { QuoteCardSheet, type CardSource } from "../notebook/QuoteCardSheet";
import { FormatSheet } from "./FormatSheet";
import {
  playPageSound,
  systemNotify,
  useClockBattery,
  useHealthAlerts,
  useReadingSession,
  useThemeColor,
  useTiltPaging,
  useWakeLock,
} from "./hooks";
import { BlueLightFilter, BookInfoSheet, EditViewSheet, FootnoteSheet, QuickAdjustSheet, ReadingRuler } from "./ReaderExtras";
import { PdfView } from "./PdfView";
import { ReflowView, type FootnoteInfo, type GoTarget, type SelectionInfo, type ViewHandle, type ViewLocation } from "./ReflowView";
import { RsvpPlayer, type RsvpBlock, type RsvpResult } from "./RsvpPlayer";
import { SearchSheet } from "./SearchSheet";
import { readerFont, readerTheme } from "./themes";
import { TocSheet } from "./TocSheet";
import { listVoices, TtsController, ttsSupported } from "./tts";
import { Cover } from "../components/Cover";

type SheetName = null | "toc" | "format" | "search" | "end" | "tts" | "info" | "edit" | "brightness" | "fontSize";
type Tool = null | "draw" | "crop";

export function ReaderScreen({ bookId }: { bookId: string }) {
  const book = useStore((s) => s.books[bookId]);
  const hydrated = useStore((s) => s.hydrated);
  const r = useStore((s) => s.reader);
  const engine = { bookStyles: r.bookStyles, publisherFonts: r.publisherFonts, cleanEmptyLines: r.cleanEmptyLines, cleanSpaces: r.cleanSpaces };
  const eKey = engineKey(engine);
  const [content, setContent] = useState<BookContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!book) return;
    let alive = true;
    setContent(null);
    setError(null);
    setEngineOptions(engine);
    openBookContent(book)
      .then((c) => alive && setContent(c))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "No se pudo abrir el libro"));
    return () => {
      alive = false;
    };
    // Solo al cambiar de libro (no en cada actualización de sus datos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, eKey]);

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
  const allDrawings = useStore((s) => s.drawings);
  const highlights = useMemo(() => allHighlights.filter((h) => h.bookId === book.id), [allHighlights, book.id]);
  const drawings = useMemo(() => allDrawings.filter((d) => d.bookId === book.id && !d.discardedAt), [allDrawings, book.id]);

  const theme = readerTheme(settings.theme, settings.customTheme);
  const font = readerFont(settings.font);
  const pdfPages = content.kind === "pdf" && (book.pdfMode ?? "pages") === "pages";
  const baseFlow: ReflowContent | null = useMemo(
    () => (content.kind === "pdf" ? (pdfPages ? null : content.asReflow()) : content),
    [content, pdfPages]
  );
  // Vista de edición: capítulos retocados en esta sesión.
  const [overrides, setOverrides] = useState<Map<number, string>>(() => new Map());
  const flow: ReflowContent | null = useMemo(() => {
    if (!baseFlow || !overrides.size) return baseFlow;
    return { ...baseFlow, getHtml: (i: number) => (overrides.has(i) ? Promise.resolve(overrides.get(i)!) : baseFlow.getHtml(i)) };
  }, [baseFlow, overrides]);
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
  const [tool, setTool] = useState<Tool>(null);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [savedClip, setSavedClip] = useState<Clip | null>(null);
  const [card, setCard] = useState<CardSource | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [brightHint, setBrightHint] = useState(false);
  const [ttsState, setTtsState] = useState<{ active: boolean; playing: boolean }>({ active: false, playing: false });
  const [footnote, setFootnote] = useState<FootnoteInfo | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const clock = useClockBattery();
  const percentRef = useRef(book.location?.percent ?? 0);

  useWakeLock(settings.keepAwake);
  useThemeColor(theme.chrome);
  const session = useReadingSession(book.id, () => ttsState.playing || autoScroll, () => percentRef.current);

  useHealthAlerts(settings.breakReminderMin, settings.scheduledAlerts, session.sessionMs, (title, text) => {
    toast(`${title}. ${text}`, { icon: "👁️" }, 8000);
    systemNotify(title, text);
  });

  // Ocultar la barra de notificaciones (pantalla completa), también al cambiar el ajuste.
  useEffect(() => {
    if (settings.fullscreen && !document.fullscreenElement) void document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => undefined);
    else if (!settings.fullscreen && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [settings.fullscreen]);
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      try {
        screen.orientation?.unlock?.();
      } catch {
        /* sin bloqueo */
      }
    },
    []
  );

  const pageTurned = useCallback(() => {
    session.pageTurned();
    if (settings.pageSound) playPageSound(settings.pageSoundVolume);
  }, [session, settings.pageSound, settings.pageSoundVolume]);

  useTiltPaging(settings.tiltPaging && !sheet, settings.tiltThreshold, () => viewRef.current?.next(), () => viewRef.current?.prev());

  // Al llegar desde un cuaderno se abre justo en la nota elegida.
  const [jump] = useState(() => takePendingJump(book.id));
  const jumpUsed = useRef(false);
  const initial = useMemo((): GoTarget => {
    if (jump && !jumpUsed.current) {
      jumpUsed.current = true;
      return { ...jump, chapter: clamp(jump.chapter, 0, Math.max(0, totalChapters - 1)) };
    }
    return { chapter: clamp(book.location?.chapter ?? 0, 0, Math.max(0, totalChapters - 1)), fraction: book.location?.fraction ?? 0 };
    // Posición inicial solo al montar o al cambiar el modo de PDF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, book.pdfMode]);

  const saveLocation = useMemo(
    () => debounce((l: ViewLocation, percent: number) => setLocation(book.id, { chapter: l.chapter, fraction: l.fraction, percent }), 400),
    [book.id, setLocation]
  );
  useEffect(() => () => saveLocation.flush(), [saveLocation]);
  const saveDayPercent = useMemo(() => debounce((pct: number) => useStore.getState().notePercent(book.id, pct), 1500), [book.id]);
  useEffect(() => () => saveDayPercent.flush(), [saveDayPercent]);

  const percent = loc ? globalPercent(content, loc.chapter, content.kind === "pdf" && pdfPages ? loc.fraction : loc.displayFraction) : book.location?.percent ?? 0;

  const onLocation = useCallback(
    (l: ViewLocation) => {
      setLoc(l);
      const pct = globalPercent(content, l.chapter, content.kind === "pdf" && pdfPages ? l.fraction : l.displayFraction);
      percentRef.current = pct;
      saveLocation(l, pct);
      saveDayPercent(pct);
    },
    [content, pdfPages, saveLocation, saveDayPercent]
  );

  // --- Marcadores ---------------------------------------------------------------
  const pageBookmark = useMemo(() => {
    if (!loc) return undefined;
    return allBookmarks.find(
      (b) => b.bookId === book.id && !b.discardedAt && b.chapter === loc.chapter && Math.abs(b.fraction - loc.fraction) < 0.5 / Math.max(1, loc.pages)
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

  // --- Archivo anterior / siguiente (orden alfabético de la biblioteca) ---
  const goFile = (dir: 1 | -1) => {
    const list = Object.values(useStore.getState().books).sort((a, b) => a.title.localeCompare(b.title, "es"));
    const i = list.findIndex((b) => b.id === book.id);
    const other = list[i + dir];
    if (!other) {
      toast(dir > 0 ? "Es el último libro de tu biblioteca" : "Es el primer libro de tu biblioteca");
      return;
    }
    saveLocation.flush();
    navigate({ name: "reader", bookId: other.id }, { replace: true });
  };

  const toggleOrientation = async () => {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    const next = o?.type?.startsWith("portrait") ? "landscape" : "portrait";
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.().catch(() => undefined);
      await o.lock?.(next);
      toast(next === "landscape" ? "Pantalla en horizontal" : "Pantalla en vertical");
    } catch {
      toast("Este navegador no permite girar la pantalla desde la app: usa el giro automático del teléfono.", {}, 4500);
    }
  };

  // --- Tiempo restante ---------------------------------------------------------
  const timeLeft = useMemo(() => {
    if (settings.timeLeft === "off" || !loc || !book.wordCount) return "";
    const { wpm } = readingWpm(book);
    const frac = content.kind === "pdf" && pdfPages ? 1 : loc.displayFraction;
    const left = remainingWords(book.wordCount, sizes, loc.chapter, frac, percent);
    const ch = formatMinutes(minutesFor(left.chapter, wpm));
    const bk = formatMinutes(minutesFor(left.book, wpm));
    if (settings.timeLeft === "chapter") return `${ch} en el capítulo`;
    if (settings.timeLeft === "book") return `${bk} en el libro`;
    return `Cap. ${ch} · Libro ${bk}`;
  }, [settings.timeLeft, loc, book, content.kind, pdfPages, sizes, percent]);

  // --- Cuaderno, dibujo y recortes ---------------------------------------------------
  const percentOf = (chapter: number, fraction: number) => globalPercent(content, chapter, fraction);
  const here = loc ? { chapter: loc.chapter, fraction: loc.fraction, percent, label: chapterTitle(loc.chapter) } : undefined;

  const openTool = (t: Tool) => {
    stopTts();
    setMenu(false);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    setTool(t);
  };

  const goTarget = (t: GoTarget) => {
    setNotebookOpen(false);
    setMenu(false);
    if (pdfPages) viewRef.current?.goTo({ chapter: t.chapter, fraction: "fraction" in t ? t.fraction ?? 0 : 0 });
    else viewRef.current?.goTo(t);
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

  const printed = settings.printedPages && loc?.printedPage ? `Pág. impresa ${loc.printedPage}` : "";
  const percentText = `${(percent * 100).toFixed(percent < 0.1 ? 1 : 0)}%`;

  const pageLabel = loc
    ? content.kind === "pdf" && pdfPages
      ? `Pág. ${loc.chapter + 1} de ${content.numPages}`
      : settings.mode === "paged" || !settings.allowScroll || flow?.fixedLayout
        ? `${loc.page + 1} / ${loc.pages}`
        : ""
    : "";
  const progressText =
    settings.progressDisplay === "percent" ? percentText : settings.progressDisplay === "page" ? pageLabel || percentText : [pageLabel, percentText].filter(Boolean).join(" · ");

  const scrubValue = scrub ?? (content.kind === "pdf" && pdfPages ? loc?.chapter ?? 0 : percent);
  const scrubLabel =
    content.kind === "pdf" && pdfPages
      ? `Página ${Math.round(scrubValue) + 1}`
      : `${chapterTitle(locationFromPercent(sizes, scrubValue).chapter)} · ${Math.round(scrubValue * 100)}%`;

  function toolbarItem(id: ToolId): { icon: React.ReactNode; label: string; run: () => void; disabled?: boolean; active?: boolean } {
    const go = (f: () => void) => () => {
      setMenu(false);
      f();
    };
    switch (id) {
      case "toc":
        return { icon: <ListTree size={22} />, label: "Índice", run: () => setSheet("toc") };
      case "format":
        return { icon: <Type size={22} />, label: "Aspecto", run: () => setSheet("format") };
      case "night":
        return { icon: theme.dark ? <Sun size={22} /> : <Moon size={22} />, label: theme.dark ? "Día" : "Noche", run: toggleNight };
      case "tts":
        return { icon: <Headphones size={22} />, label: "Escuchar", run: () => (ttsState.active ? setSheet("tts") : startTts()) };
      case "rsvp":
        return { icon: <Zap size={22} />, label: "Rápida", run: () => void openRsvp(), disabled: !!flow?.fixedLayout };
      case "select":
        return {
          icon: <TextCursorInput size={22} />,
          label: "Seleccionar",
          active: selectMode,
          disabled: pdfPages,
          run: go(() => {
            setSelectMode((v) => !v);
            toast(selectMode ? "Selección desactivada" : "Arrastra el dedo sobre el texto para seleccionarlo");
          }),
        };
      case "search":
        return { icon: <Search size={22} />, label: "Buscar", run: () => setSheet("search") };
      case "autoscroll":
        return {
          icon: <ArrowDownWideNarrow size={22} />,
          label: "Auto",
          active: autoScroll,
          run: go(() => {
            setAutoScroll((v) => !v);
            if (!autoScroll) toast("Desplazamiento automático · toca el centro para pausar");
          }),
        };
      case "prevChapter":
        return { icon: <ChevronsLeft size={22} />, label: "Cap. ant.", disabled: !loc || loc.chapter === 0, run: () => loc && viewRef.current?.goTo({ chapter: loc.chapter - 1, fraction: 0 }) };
      case "nextChapter":
        return {
          icon: <ChevronsRight size={22} />,
          label: "Cap. sig.",
          disabled: !loc || loc.chapter >= totalChapters - 1,
          run: () => loc && viewRef.current?.goTo({ chapter: loc.chapter + 1, fraction: 0 }),
        };
      case "prevFile":
        return { icon: <SkipBack size={22} />, label: "Libro ant.", run: () => goFile(-1) };
      case "nextFile":
        return { icon: <SkipForward size={22} />, label: "Libro sig.", run: () => goFile(1) };
      case "bookmark":
        return { icon: <Bookmark size={22} fill={pageBookmark ? "currentColor" : "none"} />, label: "Marcador", active: !!pageBookmark, run: toggleBookmark };
      case "brightness":
        return { icon: <Sun size={22} />, label: "Brillo", run: () => setSheet("brightness") };
      case "fontSize":
        return { icon: <ALargeSmall size={22} />, label: "Letra", run: () => setSheet("fontSize"), disabled: pdfPages || !!flow?.fixedLayout };
      case "orientation":
        return { icon: <ScreenShare size={22} />, label: "Girar", run: () => void toggleOrientation() };
      case "info":
        return { icon: <Info size={22} />, label: "Info", run: () => setSheet("info") };
      case "edit":
        return { icon: <FileCode size={22} />, label: "Edición", run: () => setSheet("edit"), disabled: !flow || !!flow.fixedLayout };
      case "draw":
        return { icon: <PenLine size={22} />, label: "Dibujar", run: () => openTool("draw") };
      case "crop":
        return { icon: <Crop size={22} />, label: "Recortar", run: () => openTool("crop") };
    }
  }

  return (
    <div
      className={`reader ${theme.dark ? "dark" : "light"} ${settings.showStatus ? (settings.miniStatus ? "with-mini-status" : "with-status") : ""}`}
      style={cssVars}
    >
      {settings.showStatus && !settings.miniStatus && (
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
          initial={{ chapter: initial.chapter, fraction: "fraction" in initial ? initial.fraction ?? 0 : 0 }}
          pdfFilter={theme.pdfFilter}
          drawings={drawings}
          locked={!!tool}
          menuOpen={menu}
          onLocation={onLocation}
          onCenterTap={() => setMenu((m) => !m)}
          onPageTurn={pageTurned}
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
          drawings={drawings}
          paper={{ bg: theme.bg, dark: theme.dark }}
          locked={!!tool}
          menuOpen={menu}
          onLocation={onLocation}
          onCenterTap={() => {
            setSelection(null);
            if (autoScroll) {
              setAutoScroll(false);
              toast("Desplazamiento automático en pausa");
              return;
            }
            setMenu((m) => !m);
          }}
          onPageTurn={pageTurned}
          onReachEnd={onReachEnd}
          onHighlightTap={(id) => setEditing(highlights.find((h) => h.id === id) ?? null)}
          onSelection={(s) => {
            setSelection(s);
            if (s) setMenu(false);
          }}
          onBrightness={setBrightness}
          onFontSize={(v) => setReader({ fontSize: v })}
          onFootnote={setFootnote}
          selectMode={selectMode}
          autoScroll={autoScroll && !menu && !sheet}
          onExternalLink={async (href) => {
            if (await confirmDialog("¿Abrir enlace externo?", href, "Abrir")) window.open(href, "_blank", "noopener");
          }}
        />
      ) : null}

      {settings.showStatus && !settings.miniStatus && (
        <div className="rd-status bottom">
          <span className="ellipsis">{[settings.progressDisplay === "percent" ? pageLabel : "", printed, timeLeft].filter(Boolean).join(" · ")}</span>
          <span className="rd-clock">
            {clock.time}
            {clock.battery !== null && <span className="rd-batt"> · {clock.battery}%</span>}
          </span>
          <span>{progressText}</span>
        </div>
      )}
      {settings.showStatus && settings.miniStatus && (
        <div className="rd-status mini">
          <span className="ellipsis">{[clock.time, timeLeft, printed].filter(Boolean).join(" · ")}</span>
          <span>{progressText}</span>
          <div className="rd-mini-bar" style={{ width: `${percent * 100}%` }} />
        </div>
      )}

      <BlueLightFilter settings={settings} />
      <ReadingRuler settings={settings} />

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
        <button className="icon-btn" onClick={() => setSheet("edit")} aria-label="Vista de edición" disabled={!flow || !!flow.fixedLayout}>
          <FileCode size={20} />
        </button>
        <button className="icon-btn" onClick={() => setSheet("info")} aria-label="Información del libro">
          <Info size={21} />
        </button>
        <button className="icon-btn" onClick={() => setNotebookOpen(true)} aria-label="Cuaderno de notas">
          <NotebookText size={21} />
        </button>
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
        <div className={`rd-actions ${settings.toolbarRows === 2 ? "two-rows" : ""}`}>
          {settings.toolbarItems.map((id) => {
            const t = toolbarItem(id);
            return (
              <button key={id} className={`rd-action ${t.active ? "active" : ""}`} onClick={t.run} disabled={t.disabled}>
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
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

      {selection && !menu && !tool && (
        <SelectionMenu
          sel={selection}
          bookId={book.id}
          bookTitle={book.title}
          percent={percentOf(selection.chapter, selection.fraction)}
          onDone={() => setSelection(null)}
          onEditHighlight={(h) => setEditing(h)}
        />
      )}

      {tool === "draw" && (
        <DrawMode
          surface={() => viewRef.current?.ink() ?? null}
          bookId={book.id}
          where={(chapter) =>
            loc && chapter === loc.chapter && !pdfPages
              ? { fraction: loc.fraction, percent }
              : { fraction: 0, percent: percentOf(chapter, 0) }
          }
          onPrev={() => viewRef.current?.prev()}
          onNext={() => viewRef.current?.next()}
          onClose={() => setTool(null)}
        />
      )}

      {tool === "crop" && (
        <CropTool
          surface={() => viewRef.current?.ink() ?? null}
          bookId={book.id}
          percentOf={percentOf}
          onClose={() => setTool(null)}
          onSaved={(clip) => {
            setTool(null);
            setSavedClip(clip);
          }}
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
        onOpenNotebook={() => {
          setSheet(null);
          setNotebookOpen(true);
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

      <BookInfoSheet
        open={sheet === "info"}
        onClose={() => setSheet(null)}
        book={book}
        content={content}
        percent={percent}
        chapter={loc?.chapter ?? 0}
        chapterFraction={content.kind === "pdf" && pdfPages ? 1 : loc?.displayFraction ?? 0}
        sizes={sizes}
        pages={null}
      />

      {flow && (
        <EditViewSheet
          open={sheet === "edit"}
          onClose={() => setSheet(null)}
          chapterTitle={chapterTitle(loc?.chapter ?? 0)}
          getHtml={() => flow.getHtml(loc?.chapter ?? 0)}
          onApply={(html) => {
            const c = loc?.chapter ?? 0;
            setOverrides((m) => new Map(m).set(c, html));
            setSheet(null);
          }}
          onReset={() => {
            const c = loc?.chapter ?? 0;
            setOverrides((m) => {
              const n = new Map(m);
              n.delete(c);
              return n;
            });
            setSheet(null);
          }}
        />
      )}

      <FootnoteSheet
        note={footnote}
        onClose={() => setFootnote(null)}
        onGo={(n) => {
          setFootnote(null);
          viewRef.current?.goTo(n.anchor ? { chapter: n.chapter, anchor: n.anchor } : { chapter: n.chapter, fraction: 0 });
        }}
      />

      <QuickAdjustSheet
        kind={sheet === "brightness" || sheet === "fontSize" ? sheet : null}
        onClose={() => setSheet(null)}
        settings={settings}
        onChange={setReader}
      />

      <HighlightSheet
        highlight={editing}
        bookTitle={book.title}
        onClose={() => setEditing(null)}
        onCard={(h) => setCard({ text: h.text, title: book.title, author: book.author, highlight: h })}
      />
      <QuoteCardSheet source={card} onClose={() => setCard(null)} />
      <PhotoSheet
        item={savedClip ? { kind: "clip", data: savedClip } : null}
        bookTitle={book.title}
        place={savedClip ? `Guardado en tu cuaderno · ${chapterTitle(savedClip.chapter)}` : ""}
        onClose={() => {
          const kept = useStore.getState().clips.find((c) => c.id === savedClip?.id && !c.discardedAt);
          setSavedClip(null);
          if (kept) toast("Recorte guardado en tu cuaderno", { icon: "✂️", tone: "success", action: { label: "Ver", run: () => setNotebookOpen(true) } }, 4000);
        }}
      />
      <NotebookOverlay open={notebookOpen} onClose={() => setNotebookOpen(false)}>
        <NotebookView bookId={book.id} content={content} here={here} onBack={() => setNotebookOpen(false)} onGo={goTarget} />
      </NotebookOverlay>

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

/** El cuaderno abierto encima del libro (sin salir del lector). */
function NotebookOverlay({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  useBackClose(open, onClose);
  if (!open) return null;
  return createPortal(<div className="nb-overlay">{children}</div>, document.body);
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
