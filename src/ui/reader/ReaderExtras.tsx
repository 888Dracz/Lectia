// Paneles y capas adicionales del lector: estadísticas del libro, vista de
// edición, notas al pie, ajustes rápidos, regla de lectura y filtro de luz azul.
import { useEffect, useRef, useState } from "react";
import { chapterCount, FORMAT_LABEL, type BookContent, type BookMeta } from "../../books/types";
import { sanitizeHtml } from "../../books/html";
import { countWords } from "../../lib/text";
import { formatMinutes, historyRows, minutesFor, readingWpm, remainingWords } from "../../lib/stats";
import { formatBytes, formatDuration, formatNumber, parseDayKey } from "../../lib/util";
import type { ReaderSettings } from "../../store/state";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { Range } from "../components/controls";
import { Sheet } from "../components/Sheet";
import { kelvinToRgb } from "./themes";
import type { FootnoteInfo } from "./ReflowView";

/** Conteo exacto de palabras y caracteres del libro (se calcula al abrir el panel). */
function useExactCounts(content: BookContent, open: boolean, book: BookMeta) {
  const [counts, setCounts] = useState<{ words: number; chars: number; done: boolean } | null>(
    book.charCount ? { words: book.wordCount ?? 0, chars: book.charCount, done: true } : null
  );
  useEffect(() => {
    if (!open || counts?.done) return;
    let alive = true;
    void (async () => {
      let words = 0;
      let chars = 0;
      const n = chapterCount(content);
      if (content.kind === "reflow" && content.fixedLayout) return;
      for (let i = 0; i < n; i++) {
        const t = await content.getText(i);
        words += countWords(t);
        chars += t.replace(/\s/g, "").length;
        if (!alive) return;
        if (i % 20 === 19) setCounts({ words, chars, done: false });
      }
      if (!alive) return;
      setCounts({ words, chars, done: true });
      useStore.getState().updateBook(book.id, { wordCount: words, charCount: chars });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, content]);
  return counts;
}

export function BookInfoSheet({
  open,
  onClose,
  book,
  content,
  percent,
  chapter,
  chapterFraction,
  sizes,
  pages,
}: {
  open: boolean;
  onClose: () => void;
  book: BookMeta;
  content: BookContent;
  percent: number;
  chapter: number;
  chapterFraction: number;
  sizes: number[];
  pages: number | null;
}) {
  const counts = useExactCounts(content, open, book);
  const words = counts?.words || book.wordCount || 0;
  const { wpm, measured } = readingWpm({ ...book, wordCount: words });
  const left = remainingWords(words, sizes, chapter, chapterFraction, percent);
  const rows = historyRows({ ...book, wordCount: words });
  const nChapters = content.kind === "pdf" ? content.toc.length || content.numPages : content.chapters.length;
  const totalPages = content.kind === "pdf" ? content.numPages : pages ?? Math.max(1, Math.round(words / 250));
  const pagesPerMin = wpm / 250;

  return (
    <Sheet open={open} onClose={onClose} title="Información del libro" height="86dvh">
      <div className="info-sheet">
        <h3 className="display info-title">{book.title}</h3>
        {book.author && <div className="muted">{book.author}</div>}
        {book.description && <p className="info-desc">{book.description}</p>}

        <div className="label">Metadatos</div>
        <dl className="info-grid">
          <dt>Formato</dt>
          <dd>{FORMAT_LABEL[book.format]}</dd>
          <dt>Archivo</dt>
          <dd className="info-path">Lectia › Almacenamiento interno › {book.fileName}</dd>
          <dt>Tamaño</dt>
          <dd>{(book.fileSize / 1048576).toFixed(2)} MB ({formatBytes(book.fileSize)})</dd>
          <dt>Páginas</dt>
          <dd>
            {formatNumber(totalPages)}
            {content.kind !== "pdf" && <span className="faint"> (aprox., 250 palabras por página)</span>}
          </dd>
          <dt>Capítulos</dt>
          <dd>{formatNumber(nChapters)}</dd>
          {book.language && (
            <>
              <dt>Idioma</dt>
              <dd>{book.language}</dd>
            </>
          )}
        </dl>

        <div className="label">Telemetría de lectura</div>
        <dl className="info-grid">
          <dt>Tiempo leído</dt>
          <dd>{formatDuration(book.readingMs)} ({(book.readingMs / 3600000).toFixed(1)} h)</dd>
          <dt>Velocidad</dt>
          <dd>
            {wpm} ppm · {pagesPerMin.toFixed(2)} pág/min {!measured && <span className="faint">(estimada; se ajusta al leer)</span>}
          </dd>
          <dt>Palabras</dt>
          <dd>{counts ? `${formatNumber(counts.words)}${counts.done ? "" : "…"}` : book.wordCount ? `≈ ${formatNumber(book.wordCount)}` : "Calculando…"}</dd>
          <dt>Caracteres</dt>
          <dd>{counts ? `${formatNumber(counts.chars)}${counts.done ? "" : "…"}` : "Calculando…"}</dd>
          <dt>Avance</dt>
          <dd>{(percent * 100).toFixed(1)}%</dd>
          <dt>Fin del capítulo</dt>
          <dd>{formatMinutes(minutesFor(left.chapter, wpm))}</dd>
          <dt>Fin del libro</dt>
          <dd>{formatMinutes(minutesFor(left.book, wpm))}</dd>
        </dl>

        <div className="label">Historial de lectura</div>
        {rows.length ? (
          <table className="info-history">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tiempo</th>
                <th>PPM</th>
                <th>Avance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.day}>
                  <td>{parseDayKey(r.day).toLocaleDateString("es", { day: "numeric", month: "short", year: "2-digit" })}</td>
                  <td>{formatDuration(r.ms)}</td>
                  <td>{r.wpm ?? "—"}</td>
                  <td>+{(r.delta * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="faint">Aún no hay días registrados para este libro.</p>
        )}
      </div>
    </Sheet>
  );
}

/** Vista de edición: muestra y permite retocar el HTML del capítulo (solo en esta sesión). */
export function EditViewSheet({
  open,
  onClose,
  getHtml,
  chapterTitle,
  onApply,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  getHtml: () => Promise<string>;
  chapterTitle: string;
  onApply: (html: string) => void;
  onReset: () => void;
}) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    if (open) void getHtml().then(setHtml);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={`Vista de edición · ${chapterTitle}`} height="86dvh">
      <p className="faint fmt-note">
        HTML del capítulo tal como lo muestra el lector. Los cambios se aplican en esta sesión de lectura (el archivo original no se modifica).
      </p>
      <textarea className="edit-view" value={html} spellCheck={false} onChange={(e) => setHtml(e.target.value)} />
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn btn-ghost" onClick={onReset}>
          Restaurar original
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={() => {
            onApply(sanitizeHtml(html));
            toast("Cambios aplicados", { tone: "success" });
          }}
        >
          Aplicar
        </button>
      </div>
    </Sheet>
  );
}

export function FootnoteSheet({ note, onClose, onGo }: { note: FootnoteInfo | null; onClose: () => void; onGo: (n: FootnoteInfo) => void }) {
  return (
    <Sheet open={!!note} onClose={onClose} title="Nota">
      {/* El HTML ya pasó por DOMPurify al cargar el libro. */}
      {note && <div className="rd-content footnote-body" dangerouslySetInnerHTML={{ __html: note.html }} />}
      {note && (
        <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => onGo(note)}>
          Ir a la nota en el libro
        </button>
      )}
    </Sheet>
  );
}

/** Ajuste rápido (brillo o tamaño de letra) desde la barra de herramientas. */
export function QuickAdjustSheet({
  kind,
  onClose,
  settings,
  onChange,
}: {
  kind: "brightness" | "fontSize" | null;
  onClose: () => void;
  settings: ReaderSettings;
  onChange: (p: Partial<ReaderSettings>) => void;
}) {
  return (
    <Sheet open={!!kind} onClose={onClose} title={kind === "brightness" ? "Brillo" : "Tamaño de letra"} noBackdropBlur>
      {kind === "brightness" ? (
        <div className="fmt-row">
          <Range value={settings.brightness} min={0.15} max={1} step={0.01} onChange={(v) => onChange({ brightness: v })} label="Brillo" />
          <span className="fmt-val">{Math.round(settings.brightness * 100)}%</span>
        </div>
      ) : (
        <div className="fmt-size">
          <button className="icon-btn filled" onClick={() => onChange({ fontSize: Math.max(12, settings.fontSize - 1) })} aria-label="Letra más pequeña">
            <span style={{ fontSize: 14, fontWeight: 700 }}>A</span>
          </button>
          <Range value={settings.fontSize} min={12} max={34} onChange={(v) => onChange({ fontSize: v })} label="Tamaño de letra" />
          <button className="icon-btn filled" onClick={() => onChange({ fontSize: Math.min(34, settings.fontSize + 1) })} aria-label="Letra más grande">
            <span style={{ fontSize: 21, fontWeight: 700 }}>A</span>
          </button>
          <span className="fmt-val">{settings.fontSize}</span>
        </div>
      )}
    </Sheet>
  );
}

/** Filtro de luz azul: capa cálida que se multiplica sobre la pantalla. */
export function BlueLightFilter({ settings }: { settings: ReaderSettings }) {
  if (!settings.blueFilter) return null;
  return <div className="rd-bluefilter" style={{ background: kelvinToRgb(settings.blueTemp), opacity: settings.blueOpacity }} />;
}

/** Regla de lectura: una franja clara para seguir la línea; se arrastra con el dedo. */
export function ReadingRuler({ settings }: { settings: ReaderSettings }) {
  const [top, setTop] = useState(0.38);
  const drag = useRef<{ y: number; top: number } | null>(null);
  if (!settings.ruler) return null;
  const h = settings.rulerHeight * settings.lineHeight * settings.fontSize;
  return (
    <div className="rd-ruler" style={{ ["--ruler-top" as string]: `${top * 100}%`, ["--ruler-h" as string]: `${h}px` }}>
      <div className="rd-ruler-shade top" />
      <div className="rd-ruler-band" />
      <div className="rd-ruler-shade bottom" />
      <div
        className="rd-ruler-grip"
        aria-label="Mover la regla de lectura"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, top };
          e.stopPropagation();
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setTop(Math.min(0.92, Math.max(0.04, d.top + (e.clientY - d.y) / window.innerHeight)));
        }}
        onPointerUp={() => (drag.current = null)}
      />
    </div>
  );
}
