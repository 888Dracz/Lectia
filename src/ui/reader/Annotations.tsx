import { BookA, Copy, Eraser, Image, NotebookPen, Send, Share2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { capitalize } from "../../lib/util";
import { HIGHLIGHT_COLOR_IDS, HIGHLIGHT_COLORS, MARK_STYLES, markStyleInfo } from "../../notes/marks";
import { invertMarkEdit, isEmptyEdit, markSpan, marksIn, recolorSpan, stylesOn, unmarkSpan, type MarkEdit } from "../../notes/markEdit";
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

/** Quita una marca (va a "Descartados" del cuaderno) con opción de deshacer. */
export function discardHighlight(h: Highlight) {
  const store = useStore.getState();
  store.discardEntry("highlight", h.id);
  toast(`${capitalize(markStyleInfo(h.style).noun)} quitado`, {
    icon: "🧽",
    action: { label: "Deshacer", run: () => useStore.getState().restoreEntry("highlight", h.id) },
  }, 5000);
}

/** Aplica un cambio de marcas; con `message` avisa y ofrece deshacerlo. */
function commitMarks(edit: MarkEdit, message?: string) {
  if (isEmptyEdit(edit)) return;
  useStore.getState().editHighlights(edit);
  if (message) {
    toast(message, {
      icon: "🧽",
      action: { label: "Deshacer", run: () => useStore.getState().editHighlights(invertMarkEdit(edit)) },
    }, 5000);
  }
}

/**
 * Barra flotante que aparece al seleccionar texto. Funciona como un procesador de
 * textos: si lo seleccionado ya tiene una forma (negrita, subrayado…), esa forma
 * aparece puesta y tocarla otra vez la quita; "Quitar" borra todas las marcas.
 */
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
  const all = useStore((s) => s.highlights);
  const setReader = useStore((s) => s.setReader);
  const style = useStore((s) => s.reader.markStyle);
  const color = useStore((s) => s.reader.markColor);
  const span = useMemo(() => ({ bookId, chapter: sel.chapter, start: sel.start, end: sel.end }), [bookId, sel.chapter, sel.start, sel.end]);
  const here = useMemo(() => marksIn(all, span), [all, span]);
  const on = useMemo(() => stylesOn(all, span, sel.source), [all, span, sel.source]);
  const vh = window.innerHeight;
  const extra = here.length ? 40 : 0;
  // Debajo de la selección (arriba suele estar el menú del sistema).
  const below = sel.rect.bottom + 150 + extra < vh;
  const top = below ? sel.rect.bottom + 14 : Math.max(12, sel.rect.top - 118 - extra);

  const finish = () => {
    navigator.vibrate?.(8);
    window.getSelection()?.removeAllRanges();
    onDone();
  };

  const put = (s: MarkStyle, c: HighlightColor) => {
    setReader({ markStyle: s, markColor: c });
    const { edit, mark } = markSpan(all, span, sel.source, s, c, percent);
    commitMarks(edit);
    finish();
    return mark;
  };

  const toggle = (s: MarkStyle) => {
    if (!on.has(s)) return void put(s, color);
    setReader({ markStyle: s });
    commitMarks(unmarkSpan(all, span, sel.source, s), `Quitado: ${markStyleInfo(s).noun}`);
    finish();
  };

  const pickColor = (c: HighlightColor) => {
    if (!on.has(style)) return void put(style, c);
    // Ya tiene esa forma: solo se cambia el color.
    setReader({ markColor: c });
    commitMarks(recolorSpan(all, span, style, c));
    finish();
  };

  const clearAll = () => {
    commitMarks(unmarkSpan(all, span, sel.source), here.length === 1 ? "Marca quitada" : "Marcas quitadas");
    finish();
  };

  const note = () => {
    const same = marksIn(all, span, style);
    if (on.has(style) && same.length === 1) {
      finish();
      onEditHighlight(same[0]);
      return;
    }
    const h = put(style, color);
    if (h) onEditHighlight(h);
  };

  return (
    <div className="sel-menu" style={{ top }} onPointerDown={(e) => e.preventDefault()}>
      {here.length > 0 && (
        <button className="sel-clear" onClick={clearAll}>
          <Eraser size={16} />
          {here.length === 1 ? "Quitar la marca" : `Quitar las ${here.length} marcas`}
        </button>
      )}
      <div className="sel-styles" role="group" aria-label="Forma de remarcar">
        {MARK_STYLES.map((m) => {
          const isOn = on.has(m.id);
          return (
            <button
              key={m.id}
              className={`sel-style ${style === m.id ? "active" : ""} ${isOn ? "on" : ""}`}
              onClick={() => toggle(m.id)}
              aria-pressed={isOn}
              aria-label={isOn ? `Quitar ${m.action.toLowerCase()}` : m.action}
              title={isOn ? `Quitar ${m.action.toLowerCase()}` : m.action}
            >
              {isOn && (
                <span className="sel-style-x" aria-hidden>
                  <X size={10} strokeWidth={3.2} />
                </span>
              )}
              <MarkSample style={m.id} color={color} />
              <span className="sel-style-label">{m.action}</span>
            </button>
          );
        })}
      </div>
      <div className="sel-row">
        <div className="sel-colors" role="group" aria-label="Color">
          {HIGHLIGHT_COLOR_IDS.map((c) => (
            <button
              key={c}
              className={`sel-color ${color === c ? "active" : ""}`}
              style={{ background: HIGHLIGHT_COLORS[c].dot }}
              aria-label={`${markStyleInfo(style).action} en ${HIGHLIGHT_COLORS[c].label.toLowerCase()}`}
              onClick={() => pickColor(c)}
            />
          ))}
        </div>
        <span className="sel-sep" />
        <button className="sel-btn" onClick={note} aria-label="Nota" title="Nota">
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

/** Hoja para editar una marca: forma, color, nota, compartir o quitarla. */
export function HighlightSheet({
  highlight,
  bookTitle,
  others = [],
  onSwitch,
  onClose,
  onCard,
}: {
  highlight: Highlight | null;
  bookTitle: string;
  /** Ids de todas las marcas en el punto tocado (si se encimaron varias). */
  others?: string[];
  onSwitch?: (h: Highlight) => void;
  onClose: () => void;
  /** Abre la tarjeta para compartir la cita como imagen. */
  onCard?: (h: Highlight) => void;
}) {
  const update = useStore((s) => s.updateHighlight);
  const live = useStore((s) => (highlight ? s.highlights.find((h) => h.id === highlight.id) : undefined));
  const all = useStore((s) => s.highlights);
  const [note, setNote] = useState("");
  useEffect(() => {
    setNote(highlight?.note ?? "");
  }, [highlight?.id, highlight?.note]);
  const h = live ?? highlight;
  const stacked = useMemo(
    () => (others.length > 1 ? others.map((id) => all.find((x) => x.id === id)).filter((x): x is Highlight => !!x && !x.discardedAt) : []),
    [others, all]
  );

  const saveNote = () => {
    if (h && note.trim() !== h.note) update(h.id, { note: note.trim() });
  };
  const close = () => {
    saveNote();
    onClose();
  };

  const deleteNote = () => {
    if (!h) return;
    const before = h.note;
    setNote("");
    update(h.id, { note: "" });
    if (before) {
      toast("Nota borrada", {
        icon: "🗑️",
        action: {
          label: "Deshacer",
          run: () => {
            useStore.getState().updateHighlight(h.id, { note: before });
            setNote(before);
          },
        },
      }, 5000);
    }
  };

  return (
    <Sheet open={!!highlight} onClose={close} title={h ? capitalize(markStyleInfo(h.style).noun) : ""}>
      {h && (
        <>
          {stacked.length > 1 && (
            <div className="hl-stack" role="group" aria-label="Marcas en este punto">
              <span className="faint">Aquí hay {stacked.length} marcas:</span>
              {stacked.map((x) => (
                <button
                  key={x.id}
                  className={`chip ${x.id === h.id ? "active" : ""}`}
                  onClick={() => {
                    if (x.id === h.id) return;
                    saveNote();
                    onSwitch?.(x);
                  }}
                >
                  <MarkSample style={x.style} color={x.color} />
                  {capitalize(markStyleInfo(x.style).noun)}
                </button>
              ))}
            </div>
          )}
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
          <div className="row hl-note-head">
            <label className="label" htmlFor="hl-note">
              Nota
            </label>
            <span className="spacer" />
            {(note.trim() || h.note) && (
              <button className="btn btn-ghost btn-sm" onClick={deleteNote}>
                <X size={15} /> Borrar nota
              </button>
            )}
          </div>
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
                saveNote();
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
                saveNote();
                discardHighlight(h);
                onClose();
              }}
            >
              <Eraser size={16} /> Quitar marca
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
