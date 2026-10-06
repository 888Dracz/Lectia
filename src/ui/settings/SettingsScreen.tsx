import {
  ArchiveRestore,
  Download,
  HardDrive,
  Info,
  Moon,
  Palette,
  Share2,
  ShieldCheck,
  Smartphone,
  Target,
  Trash,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createBackup, deliverFile, markBackupDone, readBackup, restoreBackup } from "../../backup/backup";
import { clearEverything } from "../../lib/db";
import { formatBytes, formatDate, formatRelative } from "../../lib/util";
import { defaultState } from "../../store/state";
import { flushSave, useStore } from "../../store/store";
import { toast, useUi } from "../../store/ui";
import { Range, Segmented, Switch } from "../components/controls";
import { choiceDialog, confirmDialog } from "../components/Dialog";
import { pickFiles } from "../library/importFlow";
import { installPrompt, useInstallAvailable } from "../../pwa";

const ACCENTS = [
  { id: "gold", color: "#f2b544", name: "Oro" },
  { id: "violet", color: "#9b8cff", name: "Violeta" },
  { id: "rose", color: "#ff7aa2", name: "Rosa" },
  { id: "teal", color: "#45d0c1", name: "Turquesa" },
] as const;

export function SettingsScreen() {
  const app = useStore((s) => s.app);
  const reader = useStore((s) => s.reader);
  const setApp = useStore((s) => s.setApp);
  const setReader = useStore((s) => s.setReader);
  const books = useStore((s) => s.books);
  const highlights = useStore((s) => s.highlights.length);
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const installable = useInstallAvailable();
  const bookCount = Object.keys(books).length;
  const totalSize = Object.values(books).reduce((a, b) => a + b.fileSize, 0);

  const refreshStorage = async () => {
    try {
      const est = await navigator.storage?.estimate?.();
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      setStorage({ usage: est?.usage ?? 0, quota: est?.quota ?? 0, persisted });
    } catch {
      setStorage(null);
    }
  };
  useEffect(() => {
    void refreshStorage();
  }, [bookCount]);

  const doBackup = async (includeFiles: boolean) => {
    const ui = useUi.getState();
    try {
      ui.setBusy(includeFiles ? "Preparando respaldo completo…" : "Preparando respaldo de datos…");
      const file = await createBackup(includeFiles, (d, t) => ui.setBusy(`Empaquetando libros ${d} de ${t}…`));
      ui.setBusy(null);
      const how = await choiceDialog("Respaldo listo", `${file.name} · ${formatBytes(file.size)}`, [
        { label: "Guardar en el teléfono", value: "save" },
        ...(navigator.canShare?.({ files: [file] }) ? [{ label: "Compartir (Drive, correo…)", value: "share", tone: "primary" as const }] : []),
      ]);
      if (!how) return;
      await deliverFile(file, how === "share");
      markBackupDone();
      toast("Respaldo guardado", { tone: "success" });
    } catch (e) {
      ui.setBusy(null);
      toast(e instanceof Error ? e.message : "No se pudo crear el respaldo", { tone: "error" });
    }
  };

  const doRestore = () =>
    pickFiles(async (files) => {
      const f = files[0];
      if (!f) return;
      const ui = useUi.getState();
      try {
        ui.setBusy("Leyendo respaldo…");
        const parsed = await readBackup(f);
        ui.setBusy(null);
        const m = parsed.json.manifest;
        const mode = await choiceDialog(
          "Restaurar respaldo",
          <>
            Respaldo del {formatDate(m.exportedAt)} con {m.books} {m.books === 1 ? "libro" : "libros"}
            {m.includesFiles ? "" : " (solo datos, sin archivos)"}.
            <br />
            <br />
            <b>Combinar</b> suma el respaldo a lo que ya tienes. <b>Reemplazar</b> borra lo actual y deja solo el respaldo.
          </>,
          [
            { label: "Reemplazar", value: "replace", tone: "danger" },
            { label: "Combinar", value: "merge", tone: "primary" },
          ]
        );
        if (!mode) return;
        ui.setBusy("Restaurando…");
        const res = await restoreBackup(parsed, mode as "merge" | "replace");
        ui.setBusy(null);
        toast(`Restaurado: ${res.books} ${res.books === 1 ? "libro" : "libros"}`, { tone: "success" });
        if (res.missingFiles) toast(`${res.missingFiles} libros no traían su archivo: vuelve a agregarlos para abrirlos.`, { tone: "error" }, 6000);
        void refreshStorage();
      } catch (e) {
        ui.setBusy(null);
        toast(e instanceof Error ? e.message : "No se pudo restaurar", { tone: "error" }, 5000);
      }
    }, ".zip,application/zip");

  const wipe = async () => {
    const ok = await confirmDialog(
      "¿Borrar todo?",
      "Se eliminarán todos los libros, notas, progreso y ajustes de este dispositivo. Esta acción no se puede deshacer. Te recomendamos hacer un respaldo antes.",
      "Borrar todo",
      true
    );
    if (!ok) return;
    await clearEverything();
    useStore.getState().replaceState(defaultState());
    flushSave();
    toast("Se borró todo");
  };

  return (
    <div className="screen settings">
      <header className="screen-header">
        <div>
          <div className="eyebrow">Lectia</div>
          <h1 className="screen-title">Ajustes</h1>
        </div>
      </header>

      <section className="section" style={{ marginTop: 6 }}>
        <div className="section-title">Respaldo</div>
        <div className="backup-card">
          <div className="backup-head">
            <ShieldCheck size={26} />
            <div>
              <div className="backup-title">Tu biblioteca a salvo</div>
              <div className="backup-sub">
                {app.lastBackupAt ? `Último respaldo ${formatRelative(app.lastBackupAt)}` : "Todavía no has hecho ningún respaldo"}
              </div>
            </div>
          </div>
          <p className="backup-text">
            Guarda en un solo archivo tus {bookCount} {bookCount === 1 ? "libro" : "libros"} ({formatBytes(totalSize)}), estanterías, posiciones de
            lectura, {highlights} subrayados y notas, ajustes, logros y estadísticas.
          </p>
          <button className="btn btn-primary btn-block" onClick={() => void doBackup(true)} disabled={!bookCount}>
            <Download size={18} /> Crear respaldo completo
          </button>
          <div className="backup-actions">
            <button className="btn btn-sm" onClick={() => void doBackup(false)}>
              <Share2 size={16} /> Solo datos (liviano)
            </button>
            <button className="btn btn-sm" onClick={doRestore}>
              <ArchiveRestore size={16} /> Restaurar
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">Apariencia</div>
        <div className="list">
          <div className="list-item col">
            <div className="row" style={{ width: "100%" }}>
              <span className="li-icon">
                <Moon size={18} />
              </span>
              <span className="li-main li-title">Tema de la app</span>
            </div>
            <Segmented
              value={app.theme}
              onChange={(v) => setApp({ theme: v })}
              options={[
                { value: "system", label: "Sistema" },
                { value: "light", label: "Claro" },
                { value: "dark", label: "Oscuro" },
              ]}
            />
          </div>
          <div className="list-item">
            <span className="li-icon">
              <Palette size={18} />
            </span>
            <span className="li-main li-title">Color de acento</span>
            <div className="accent-picker">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  className={`accent-swatch ${app.accent === a.id ? "active" : ""}`}
                  style={{ background: a.color }}
                  aria-label={a.name}
                  onClick={() => setApp({ accent: a.id })}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">Lectura</div>
        <div className="list">
          <div className="list-item col">
            <div className="row" style={{ width: "100%" }}>
              <span className="li-icon">
                <Target size={18} />
              </span>
              <span className="li-main li-title">Meta diaria</span>
              <span className="li-value">{app.dailyGoalMin} min</span>
            </div>
            <Range value={app.dailyGoalMin} min={5} max={120} step={5} onChange={(v) => setApp({ dailyGoalMin: v })} label="Meta diaria en minutos" />
          </div>
          <div className="list-item">
            <span className="li-main">
              <div className="li-title">Pantalla completa al leer</div>
              <div className="li-sub">Oculta la barra del sistema</div>
            </span>
            <Switch on={reader.fullscreen} onChange={(v) => setReader({ fullscreen: v })} />
          </div>
          <div className="list-item">
            <span className="li-main li-title">Mantener la pantalla encendida</span>
            <Switch on={reader.keepAwake} onChange={(v) => setReader({ keepAwake: v })} />
          </div>
          <div className="list-item">
            <span className="li-main li-title">Animación al pasar página</span>
            <Switch on={reader.animation === "slide"} onChange={(v) => setReader({ animation: v ? "slide" : "none" })} />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">Dispositivo</div>
        <div className="list">
          {installable && (
            <button className="list-item" onClick={() => void installPrompt()}>
              <span className="li-icon">
                <Smartphone size={18} />
              </span>
              <span className="li-main">
                <div className="li-title">Instalar Lectia</div>
                <div className="li-sub">Como una app más, con ícono y sin conexión</div>
              </span>
            </button>
          )}
          <div className="list-item">
            <span className="li-icon">
              <HardDrive size={18} />
            </span>
            <span className="li-main">
              <div className="li-title">Almacenamiento</div>
              <div className="li-sub">
                {storage ? `${formatBytes(storage.usage)} usados${storage.quota ? ` de ${formatBytes(storage.quota)} disponibles` : ""}` : "No disponible"}
              </div>
            </span>
          </div>
          {storage && (
            <div className="list-item">
              <span className="li-main">
                <div className="li-title">Almacenamiento protegido</div>
                <div className="li-sub">
                  {storage.persisted ? "El navegador no borrará tus libros para liberar espacio." : "Pide al navegador que no borre tus libros cuando falte espacio."}
                </div>
              </span>
              {storage.persisted ? (
                <span className="li-value">Activo ✓</span>
              ) : (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={async () => {
                    const ok = await navigator.storage?.persist?.();
                    toast(ok ? "Almacenamiento protegido" : "El navegador no lo permitió todavía. Instalar la app suele ayudar.", { tone: ok ? "success" : "default" });
                    void refreshStorage();
                  }}
                >
                  Activar
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-title">Acerca de</div>
        <div className="list">
          <div className="list-item">
            <span className="li-icon">
              <Info size={18} />
            </span>
            <span className="li-main">
              <div className="li-title">Lectia · Lector</div>
              <div className="li-sub">Versión {__APP_VERSION__} · Tus libros nunca salen de este dispositivo</div>
            </span>
          </div>
          <div className="list-item">
            <span className="li-main">
              <div className="li-title">Formatos</div>
              <div className="li-sub">EPUB, PDF, Word (.docx), TXT, Markdown, HTML, FB2 y cómics CBZ</div>
            </span>
          </div>
        </div>
      </section>

      <section className="section">
        <button className="btn btn-danger btn-block" onClick={() => void wipe()}>
          <Trash size={18} /> Borrar todos los datos
        </button>
      </section>
    </div>
  );
}
