import { BookA, Copy, Image, NotebookPen, Send, Share2, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { capitalize } from "../../lib/util";
import { HIGHLIGHT_COLOR_IDS, HIGHLIGHT_COLORS, MARK_STYLES, markStyleInfo } from "../../notes/marks";
import type { Highlight, HighlightColor, MarkStyle } from "../../store/state";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { choiceDialog, promptDialog } from "../components/Dialog";
import { openShare } from "../community/ShareSheet";
import { Sheet } from "../components/Sheet";
import type { SelectionInfo } from "./ReflowView";

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copiado", { tone: "success" });
  } catch {
    toast("No se pudo copiar", { tone: "error" });
  }
}

/** Busca primero en el diccionario propio; si no está, ofrece agregarla o buscarla en línea. */
export async function define(text: string) {
  const word = text.trim().split(/\s+/)[0].replace(/[^\p{L}-]/gu, "").toLowerCase();
  if (!word) return;
  const store = useStore.getState();
  const dict = store.app.dictionary;
  const entry = dict.find((d) => d.word === word);
  const online = () => window.open(`https://dle.rae.es/${encodeURIComponent(word)}`, "_blank", "noopener");
  const edit = async () => {
    const def = await promptDialog(`Definición de “${word}”`, entry?.definition ?? "", "Escribe tu definición");
    if (def === null) return;
    const rest = dict.filter((d) => d.word !== word);
    store.setApp({ dictionary: def.trim() ? [...rest, { word, definition: def.trim(), createdAt: Date.now() }] : rest });
    toast(def.trim() ? "Guardado en tu diccionario" : "Quitado del diccionario", { tone: "success" });
  };
  const buttons = [
    ...(store.app.onlineDictionary ? [{ label: "Buscar en línea", value: "online" }] : []),
    { label: entry ? "Editar" : "Agregar a mi diccionario", value: "edit", tone: "primary" as const },
  ];
  const choice = await choiceDialog(word, entry ? entry.definition : "No está en tu diccionario personal.", buttons);
  if (choice === "online") online();
  else if (choice === "edit") await edit();
}

export async function shareQuote(text: string, title: string) {
  if (navigator.share) {
    try {
      await navigator.share({ text: `«${text}»\n— ${title}` });
    } catch {
      /* cancelado */
    }
  } else void copyText(text);
}

/** Muestra de una forma de remarcar ("Aa" resaltado, subrayado…). */
export function MarkSample({ style, color, children = "Aa" }: { style: MarkStyle; color: HighlightColor; children?: ReactNode }) {
  return (
    <span className="mk" data-s={style} data-c={color}>
      {children}
    </span>
  );
}

/** Manda un subrayado a "Descartados" con opción de deshacer. */
export function discardHighlight(h: Highlight) {
  const store = useStore.getState();
  store.discardEntry("highlight", h.id);
  toast(`${capitalize(markStyleInfo(h.style).noun)} descartado`, {
    icon: "🗑️",
    action: { label: "Deshacer", run: () => useStore.getState().restoreEntry("highlight", h.id) },
  }, 5000);
}

/** Barra flotante que aparece al seleccionar texto. */
export function SelectionMenu({
  sel,
  bookId,
  bookTitle,
  percent,
  onDone,
  onEditHighlight,
}: {
  sel: SelectionInfo;
  bookId: string;
  bookTitle: string;
  /** Avance global aproximado del fragmento. */
  percent?: number;
  onDone: () => void;
  onEditHighlight: (h: Highlight) => void;
}) {
  const addHighlight = useStore((s) => s.addHighlight);
  const setReader = useStore((s) => s.setReader);
  const style = useStore((s) => s.reader.markStyle);
  const color = useStore((s) => s.reader.markColor);
  const vh = window.innerHeight;
  // Debajo de la selección (arriba suele estar el menú del sistema).
  const below = sel.rect.bottom + 150 < vh;
  const top = below ? sel.rect.bottom + 14 : Math.max(12, sel.rect.top - 118);

  const make = (s: MarkStyle, c: HighlightColor) => {
    setReader({ markStyle: s, markColor: c });
    const h = addHighlight({ bookId, chapter: sel.chapter, start: sel.start, end: sel.end, text: sel.text, color: c, style: s, note: "", percent });
    navigator.vibrate?.(8);
    window.getSelection()?.removeAllRanges();
    onDone();
    return h;
  };

  return (
    <div className="sel-menu" style={{ top }} onPointerDown={(e) => e.preventDefault()}>
      <div className="sel-styles" role="group" aria-label="Forma de remarcar">
        {MARK_STYLES.map((m) => (
          <button
            key={m.id}
            className={`sel-style ${style === m.id ? "active" : ""}`}
            onClick={() => make(m.id, color)}
            aria-label={m.action}
            title={m.action}
          >
            <MarkSample style={m.id} color={color} />
            <span className="sel-style-label">{m.action}</span>
          </button>
        ))}
      </div>
      <div className="sel-row">
        <div className="sel-colors" role="group" aria-label="Color">
          {HIGHLIGHT_COLOR_IDS.map((c) => (
            <button
              key={c}
              className={`sel-color ${color === c ? "active" : ""}`}
              style={{ background: HIGHLIGHT_COLORS[c].dot }}
              aria-label={`${markStyleInfo(style).action} en ${HIGHLIGHT_COLORS[c].label.toLowerCase()}`}
              onClick={() => make(style, c)}
            />
          ))}
        </div>
        <span className="sel-sep" />
        <button className="sel-btn" onClick={() => onEditHighlight(make(style, color))} aria-label="Nota" title="Nota">
          <NotebookPen size={19} />
        </button>
        <button
          className="sel-btn"
          onClick={() => {
            void copyText(sel.text);
            window.getSelection()?.removeAllRanges();
            onDone();
          }}
          aria-label="Copiar"
          title="Copiar"
        >
          <Copy size={19} />
        </button>
        {sel.text.split(/\s+/).length <= 3 && (
          <button className="sel-btn" onClick={() => void define(sel.text)} aria-label="Definir" title="Definir">
            <BookA size={19} />
          </button>
        )}
        <button className="sel-btn" onClick={() => void shareQuote(sel.text, bookTitle)} aria-label="Compartir" title="Compartir">
          <Share2 size={19} />
        </button>
      </div>
    </div>
  );
}

/** Hoja para editar un subrayado: forma, color, nota, compartir o descartar. */
export function HighlightSheet({
  highlight,
  bookTitle,
  onClose,
  onCard,
}: {
  highlight: Highlight | null;
  bookTitle: string;
  onClose: () => void;
  /** Abre la tarjeta para compartir la cita como imagen. */
  onCard?: (h: Highlight) => void;
}) {
  const update = useStore((s) => s.updateHighlight);
  const live = useStore((s) => (highlight ? s.highlights.find((h) => h.id === highlight.id) : undefined));
  const [note, setNote] = useState("");
  useEffect(() => {
    setNote(highlight?.note ?? "");
  }, [highlight?.id, highlight?.note]);
  const h = live ?? highlight;

  const close = () => {
    if (h && note !== h.note) update(h.id, { note: note.trim() });
    onClose();
  };

  return (
    <Sheet open={!!highlight} onClose={close} title={h ? capitalize(markStyleInfo(h.style).noun) : ""}>
      {h && (
        <>
          <blockquote className="hl-quote" style={{ ["--hl" as string]: HIGHLIGHT_COLORS[h.color].dot }}>
            <MarkSample style={h.style} color={h.color}>
              {h.text}
            </MarkSample>
          </blockquote>
          <div className="hl-styles" role="group" aria-label="Forma de remarcar">
            {MARK_STYLES.map((m) => (
              <button key={m.id} className={`hl-style ${h.style === m.id ? "active" : ""}`} onClick={() => update(h.id, { style: m.id })}>
                <MarkSample style={m.id} color={h.color} />
                <span>{m.action}</span>
              </button>
            ))}
          </div>
          <div className="hl-colors">
            {HIGHLIGHT_COLOR_IDS.map((c) => (
              <button
                key={c}
                className={`sel-color big ${h.color === c ? "active" : ""}`}
                style={{ background: HIGHLIGHT_COLORS[c].dot }}
                aria-label={HIGHLIGHT_COLORS[c].label}
                onClick={() => update(h.id, { color: c })}
              />
            ))}
          </div>
          <label className="label" htmlFor="hl-note">
            Nota
          </label>
          <textarea id="hl-note" className="field hand" value={note} placeholder="Escribe lo que te hizo pensar este fragmento…" onChange={(e) => setNote(e.target.value)} />
          <div className="row" style={{ marginTop: 14, flexWrap: "wrap", gap: 8 }}>
            <button className="btn btn-sm" onClick={() => void copyText(h.text)}>
              <Copy size={16} /> Copiar
            </button>
            <button className="btn btn-sm" onClick={() => void shareQuote(h.text, bookTitle)}>
              <Share2 size={16} /> Compartir
            </button>
            {onCard && (
              <button
                className="btn btn-sm"
                onClick={() => {
                  close();
                  onCard(h);
                }}
              >
                <Image size={16} /> Tarjeta
              </button>
            )}
            <button
              className="btn btn-sm"
              onClick={() => {
                if (note !== h.note) update(h.id, { note: note.trim() });
                onClose();
                openShare({ kind: "quote", highlightId: h.id });
              }}
            >
              <Send size={16} /> A mis amigos
            </button>
            <span className="spacer" />
            <button
              className="btn btn-sm btn-danger"
              onClick={() => {
                if (note !== h.note) update(h.id, { note: note.trim() });
                discardHighlight(h);
                onClose();
              }}
            >
              <Trash2 size={16} /> Descartar
            </button>
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={close}>
            Guardar
          </button>
        </>
      )}
    </Sheet>
  );
}
