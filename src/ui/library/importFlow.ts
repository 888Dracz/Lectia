import { importFiles } from "../../books/importer";
import { markdownToBook } from "../../books/formats/text";
import { useStore } from "../../store/store";
import { toast, useUi } from "../../store/ui";
import { WELCOME_BOOK } from "../../welcome";
import { navigate } from "../../lib/router";
import { choiceDialog } from "../components/Dialog";

/** Importa archivos mostrando el progreso y un resumen al final. */
export async function runImport(files: File[], opts: { external?: boolean } = {}): Promise<void> {
  if (!files.length) return;
  const ui = useUi.getState();
  // Libros que llegan desde otra app: se pregunta antes de guardarlos.
  if (opts.external && useStore.getState().app.confirmExternalSave) {
    const names = files.map((f) => f.name).join(", ");
    const choice = await choiceDialog(
      files.length === 1 ? "Guardar archivo de libro" : `Guardar ${files.length} libros`,
      `¿Quieres guardar ${names} en tu biblioteca de Lectia?`,
      [
        { label: "Cancelar", value: "no" },
        { label: files.length === 1 ? "Guardar y abrir" : "Guardar", value: "yes", tone: "primary" },
      ]
    );
    if (choice !== "yes") return;
  }
  try {
    const res = await importFiles(files, (done, total, name) => {
      ui.setBusy(total > 1 ? `Agregando ${Math.min(done + 1, total)} de ${total}…` : `Agregando “${name}”…`);
    });
    ui.setBusy(null);
    if (res.added.length === 1) toast(`“${res.added[0].title}” agregado a tu biblioteca`, { tone: "success" });
    else if (res.added.length > 1) toast(`${res.added.length} libros agregados`, { tone: "success" });
    for (const s of res.skipped) toast(`${s.name}: ${s.reason}`, { tone: "error" }, 5000);
    if (opts.external && res.added.length === 1) navigate({ name: "reader", bookId: res.added[0].id });
  } catch (e) {
    ui.setBusy(null);
    toast(e instanceof Error ? e.message : "No se pudo importar", { tone: "error" });
  }
}

/** Agrega el libro de bienvenida (una guía de la app). */
export async function addWelcomeBook(): Promise<void> {
  const exists = Object.values(useStore.getState().books).some((b) => b.sample);
  if (exists) {
    toast("La guía ya está en tu biblioteca");
    return;
  }
  // Se valida que el Markdown se interprete bien antes de guardarlo.
  markdownToBook(WELCOME_BOOK, "Guía de Lectia").content.dispose();
  const file = new File([WELCOME_BOOK], "Guía de Lectia.md", { type: "text/markdown" });
  useUi.getState().setBusy("Preparando la guía…");
  try {
    const res = await importFiles([file], undefined, { sample: true, author: "Lectia" });
    if (res.added[0]) toast("¡Listo! Ábrela para empezar", { tone: "success" });
  } finally {
    useUi.getState().setBusy(null);
    useStore.getState().setApp({ sampleOffered: true });
  }
}

// Lista explícita de tipos: sin ella, Android/iPhone muestran solo cámara y fotos.
export const BOOK_ACCEPT = [
  ".pdf", ".epub", ".docx", ".txt", ".md", ".markdown", ".html", ".htm", ".fb2", ".cbz", ".mobi", ".azw", ".azw3", ".prc",
  "application/pdf", "application/epub+zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain", "text/markdown", "text/html", "application/x-fictionbook+xml",
  "application/vnd.comicbook+zip", "application/x-mobipocket-ebook", "application/vnd.amazon.ebook", "application/zip", "application/octet-stream",
].join(",");

export function pickFiles(onFiles: (files: File[]) => void, accept?: string) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  if (accept) input.accept = accept;
  input.style.display = "none";
  input.onchange = () => {
    onFiles(Array.from(input.files ?? []));
    input.remove();
  };
  document.body.appendChild(input);
  input.click();
}
