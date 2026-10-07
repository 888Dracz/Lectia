import { BookA, Copy, NotebookPen, Share2, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import type { Highlight, HighlightColor } from "../../store/state";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { choiceDialog, promptDialog } from "../components/Dialog";
import { Sheet } from "../components/Sheet";
import type { SelectionInfo } from "./ReflowView";
import { HIGHLIGHT_COLORS } from "./themes";

const COLORS = Object.keys(HIGHLIGHT_COLORS) as HighlightColor[];

async function copy(text: string) {
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

async function share(text: string, title: string) {
  if (navigator.share) {
    try {
      await navigator.share({ text: `«${text}»\n— ${title}` });
    } catch {
      /* cancelado */
    }
  } else void copy(text);
}

/** Barra flotante que aparece al seleccionar texto. */
export function SelectionMenu({
  sel,
  bookId,
  bookTitle,
  onDone,
  onEditHighlight,
}: {
  sel: SelectionInfo;
  bookId: string;
  bookTitle: string;
  onDone: () => void;
  onEditHighlight: (h: Highlight) => void;
}) {
  const addHighlight = useStore((s) => s.addHighlight);
  const vh = window.innerHeight;
  // Debajo de la selección (arriba suele estar el menú del sistema).
  const below = sel.rect.bottom + 120 < vh;
  const top = below ? sel.rect.bottom + 14 : Math.max(12, sel.rect.top - 70);

  const make = (color: HighlightColor) => {
    const h = addHighlight({ bookId, chapter: sel.chapter, start: sel.start, end: sel.end, text: sel.text, color, note: "" });
    window.getSelection()?.removeAllRanges();
    onDone();
    return h;
  };

  return (
    <div className="sel-menu" style={{ top }} onPointerDown={(e) => e.preventDefault()}>
      <div className="sel-colors">
        {COLORS.map((c) => (
          <button key={c} className="sel-color" style={{ background: HIGHLIGHT_COLORS[c].dot }} aria-label={`Subrayar en ${HIGHLIGHT_COLORS[c].label}`} onClick={() => make(c)} />
        ))}
      </div>
      <span className="sel-sep" />
      <button className="sel-btn" onClick={() => onEditHighlight(make("yellow"))} aria-label="Nota">
        <NotebookPen size={19} />
        <span>Nota</span>
      </button>
      <button
        className="sel-btn"
        onClick={() => {
          void copy(sel.text);
          window.getSelection()?.removeAllRanges();
          onDone();
        }}
        aria-label="Copiar"
      >
        <Copy size={19} />
        <span>Copiar</span>
      </button>
      {sel.text.split(/\s+/).length <= 3 && (
        <button className="sel-btn" onClick={() => void define(sel.text)} aria-label="Definir">
          <BookA size={19} />
          <span>Definir</span>
        </button>
      )}
      <button className="sel-btn" onClick={() => void share(sel.text, bookTitle)} aria-label="Compartir">
        <Share2 size={19} />
        <span>Compartir</span>
      </button>
    </div>
  );
}

/** Hoja para editar un subrayado: color, nota, copiar o borrar. */
export function HighlightSheet({ highlight, bookTitle, onClose }: { highlight: Highlight | null; bookTitle: string; onClose: () => void }) {
  const update = useStore((s) => s.updateHighlight);
  const remove = useStore((s) => s.removeHighlight);
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
    <Sheet open={!!highlight} onClose={close} title="Subrayado">
      {h && (
        <>
          <blockquote className="hl-quote" style={{ ["--hl" as string]: HIGHLIGHT_COLORS[h.color].dot }}>
            {h.text}
          </blockquote>
          <div className="hl-colors">
            {COLORS.map((c) => (
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
          <textarea id="hl-note" className="field" value={note} placeholder="Escribe lo que te hizo pensar este fragmento…" onChange={(e) => setNote(e.target.value)} />
          <div className="row" style={{ marginTop: 14, flexWrap: "wrap" }}>
            <button className="btn btn-sm" onClick={() => void copy(h.text)}>
              <Copy size={16} /> Copiar
            </button>
            <button className="btn btn-sm" onClick={() => void share(h.text, bookTitle)}>
              <Share2 size={16} /> Compartir
            </button>
            <span className="spacer" />
            <button
              className="btn btn-sm btn-danger"
              onClick={() => {
                remove(h.id);
                onClose();
                toast("Subrayado borrado");
              }}
            >
              <Trash size={16} /> Borrar
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
