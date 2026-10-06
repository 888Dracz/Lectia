import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { useBackClose } from "../../lib/router";

interface DialogButton {
  label: string;
  value: string;
  tone?: "primary" | "danger" | "default";
}

interface DialogRequest {
  id: number;
  title: string;
  message?: ReactNode;
  buttons: DialogButton[];
  input?: { placeholder?: string; value?: string };
  resolve: (r: { button: string | null; text: string }) => void;
}

const useDialogs = create<{ current: DialogRequest | null }>(() => ({ current: null }));

let nextDialogId = 1;

function ask(req: Omit<DialogRequest, "resolve" | "id">): Promise<{ button: string | null; text: string }> {
  return new Promise((resolve) => useDialogs.setState({ current: { ...req, id: nextDialogId++, resolve } }));
}

/** Diálogo de confirmación. Devuelve true si se aceptó. */
export async function confirmDialog(title: string, message?: ReactNode, ok = "Aceptar", danger = false): Promise<boolean> {
  const r = await ask({
    title,
    message,
    buttons: [
      { label: "Cancelar", value: "cancel" },
      { label: ok, value: "ok", tone: danger ? "danger" : "primary" },
    ],
  });
  return r.button === "ok";
}

/** Pide un texto. Devuelve null si se canceló. */
export async function promptDialog(title: string, value = "", placeholder = "", ok = "Guardar"): Promise<string | null> {
  const r = await ask({
    title,
    input: { value, placeholder },
    buttons: [
      { label: "Cancelar", value: "cancel" },
      { label: ok, value: "ok", tone: "primary" },
    ],
  });
  return r.button === "ok" ? r.text : null;
}

/** Diálogo con varias opciones. Devuelve el valor elegido o null. */
export async function choiceDialog(title: string, message: ReactNode, buttons: DialogButton[]): Promise<string | null> {
  const r = await ask({ title, message, buttons: [{ label: "Cancelar", value: "cancel" }, ...buttons] });
  return r.button === "cancel" ? null : r.button;
}

export function DialogHost() {
  const current = useDialogs((s) => s.current);
  return current ? <DialogView key={current.id} req={current} /> : null;
}

function DialogView({ req }: { req: DialogRequest }) {
  const [text, setText] = useState(req.input?.value ?? "");
  const finish = (button: string | null) => {
    useDialogs.setState({ current: null });
    req.resolve({ button, text });
  };
  useBackClose(true, () => finish(null));
  return createPortal(
    <div className="dialog-wrap">
      <div className="backdrop" onClick={() => finish(null)} />
      <div className="dialog" role="alertdialog" aria-modal="true">
        <h3>{req.title}</h3>
        {req.message && <div className="muted">{req.message}</div>}
        {req.input && (
          <input
            className="field"
            style={{ marginTop: 12 }}
            autoFocus
            value={text}
            placeholder={req.input.placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && finish("ok")}
          />
        )}
        <div className="dialog-actions">
          {req.buttons.map((b) => (
            <button
              key={b.value}
              className={`btn btn-sm ${b.tone === "primary" ? "btn-primary" : b.tone === "danger" ? "btn-danger" : "btn-ghost"}`}
              onClick={() => finish(b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
