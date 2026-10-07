import {
  BookA,
  Cloud,
  CloudDownload,
  CloudUpload,
  RefreshCw,
  Settings2,
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
import { createBackup, createSettingsBackup, deliverFile, markBackupDone, readBackup, restoreBackup, restoreSettingsBackup } from "../../backup/backup";
import { runSync, type SyncDirection } from "../../sync/sync";
import type { ReaderThemeId, SyncProvider } from "../../store/state";
import { promptDialog } from "../components/Dialog";
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

  const sync = app.sync;
  const setSync = (patch: Partial<typeof sync>) => setApp({ sync: { ...sync, ...patch } });
  const [syncing, setSyncing] = useState(false);
  const doSync = async (dir: SyncDirection) => {
    setSyncing(true);
    try {
      toast(await runSync(dir), { tone: "success", icon: "☁️" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo sincronizar";
      toast(/Failed to fetch|NetworkError|Load failed/i.test(msg) ? "No se pudo conectar con el servidor (¿sin conexión o el servidor no permite CORS?)" : msg, { tone: "error" }, 6000);
    } finally {
      setSyncing(false);
    }
  };

  const addWord = async () => {
    const word = (await promptDialog("Nueva palabra", "", "Palabra"))?.trim().toLowerCase();
    if (!word) return;
    const definition = await promptDialog(`Definición de “${word}”`, app.dictionary.find((d) => d.word === word)?.definition ?? "", "Definición");
    if (definition === null) return;
    setApp({ dictionary: [...app.dictionary.filter((d) => d.word !== word), { word, definition: definition.trim(), createdAt: Date.now() }] });
  };

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
          <div className="backup-actions">
            <button className="btn btn-sm" onClick={() => void deliverFile(createSettingsBackup(), true).then(() => toast("Copia de ajustes guardada", { tone: "success" }))}>
              <Settings2 size={16} /> Copiar ajustes
            </button>
            <button
              className="btn btn-sm"
              onClick={() =>
                pickFiles(async (files) => {
                  if (!files[0]) return;
                  try {
                    await restoreSettingsBackup(files[0]);
                    toast("Ajustes restaurados", { tone: "success" });
                  } catch (e) {
                    toast(e instanceof Error ? e.message : "No se pudo restaurar", { tone: "error" });
                  }
                }, ".json,application/json")
              }
            >
              <ArchiveRestore size={16} /> Restaurar ajustes
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">Sincronización en la nube</div>
        <div className="list">
          <div className="list-item col">
            <div className="row" style={{ width: "100%" }}>
              <span className="li-icon">
                <Cloud size={18} />
              </span>
              <span className="li-main">
                <div className="li-title">Servicio</div>
                <div className="li-sub">Progreso, marcadores y notas{sync.lastSyncAt ? ` · última vez ${formatRelative(sync.lastSyncAt)}` : ""}</div>
              </span>
            </div>
            <Segmented<SyncProvider>
              value={sync.provider}
              onChange={(v) => setSync({ provider: v })}
              options={[
                { value: "none", label: "No" },
                { value: "dropbox", label: "Dropbox" },
                { value: "gdrive", label: "Drive" },
                { value: "webdav", label: "WebDAV" },
                { value: "ftp", label: "FTP" },
              ]}
            />
          </div>
          {(sync.provider === "webdav" || sync.provider === "ftp") && (
            <div className="list-item col">
              <input className="field" placeholder={sync.provider === "ftp" ? "https://servidor/carpeta (pasarela HTTP del FTP)" : "https://servidor/remote.php/dav/files/usuario/Lectia"} value={sync.url} onChange={(e) => setSync({ url: e.target.value.trim() })} />
              <input className="field" placeholder="Usuario" autoComplete="username" value={sync.user} onChange={(e) => setSync({ user: e.target.value })} />
              <input className="field" placeholder="Contraseña" type="password" autoComplete="current-password" value={sync.password} onChange={(e) => setSync({ password: e.target.value })} />
              {sync.provider === "ftp" && (
                <div className="li-sub">Los navegadores no hablan FTP: escribe la dirección https:// (WebDAV/HTTP) que ofrece tu servidor FTP.</div>
              )}
            </div>
          )}
          {(sync.provider === "dropbox" || sync.provider === "gdrive") && (
            <div className="list-item col">
              <input className="field" placeholder="Token de acceso" type="password" value={sync.token} onChange={(e) => setSync({ token: e.target.value.trim() })} />
              <div className="li-sub">
                {sync.provider === "dropbox"
                  ? "Crea una app en dropbox.com/developers (permiso files.content.write) y genera un token de acceso."
                  : "Genera un token OAuth con el permiso drive.appdata (p. ej. en el OAuth Playground de Google). Los datos se guardan en la carpeta privada de la app."}
              </div>
            </div>
          )}
          {sync.provider !== "none" && (
            <>
              <div className="list-item">
                <span className="li-main">
                  <div className="li-title">Sincronizar automáticamente</div>
                  <div className="li-sub">Al abrir y al salir de la app</div>
                </span>
                <Switch on={sync.auto} onChange={(v) => setSync({ auto: v })} />
              </div>
              <div className="list-item">
                <div className="backup-actions" style={{ width: "100%", marginTop: 0 }}>
                  <button className="btn btn-sm" disabled={syncing} onClick={() => void doSync("upload")}>
                    <CloudUpload size={16} /> Subir
                  </button>
                  <button className="btn btn-sm" disabled={syncing} onClick={() => void doSync("download")}>
                    <CloudDownload size={16} /> Descargar
                  </button>
                  <button className="btn btn-sm btn-primary" disabled={syncing} onClick={() => void doSync("both")}>
                    <RefreshCw size={16} /> Sincronizar
                  </button>
                </div>
              </div>
            </>
          )}
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
          <div className="list-item col">
            <div className="row" style={{ width: "100%" }}>
              <span className="li-main li-title">Tema de lectura</span>
            </div>
            <Segmented<ReaderThemeId>
              value={(["day", "night", "sepia", "custom"] as ReaderThemeId[]).includes(reader.theme) ? reader.theme : ("" as ReaderThemeId)}
              onChange={(v) => setReader({ theme: v })}
              options={[
                { value: "day", label: "Diurno" },
                { value: "night", label: "Nocturno" },
                { value: "sepia", label: "Sepia" },
                { value: "custom", label: "Personal" },
              ]}
            />
            {reader.theme === "custom" && (
              <div className="custom-theme">
                {(["bg", "fg", "link"] as const).map((k) => (
                  <label key={k} className="custom-color">
                    <input type="color" value={reader.customTheme[k]} onChange={(e) => setReader({ customTheme: { ...reader.customTheme, [k]: e.target.value } })} />
                    <span>{k === "bg" ? "Fondo" : k === "fg" ? "Texto" : "Enlaces"}</span>
                  </label>
                ))}
                <label className="custom-color">
                  <Switch on={reader.customTheme.dark} onChange={(v) => setReader({ customTheme: { ...reader.customTheme, dark: v } })} />
                  <span>Oscuro</span>
                </label>
              </div>
            )}
          </div>
          <div className="list-item col">
            <div className="row" style={{ width: "100%" }}>
              <span className="li-main li-title">Barra de herramientas del lector</span>
            </div>
            <Segmented
              value={String(reader.toolbarRows) as "1" | "2"}
              onChange={(v) => setReader({ toolbarRows: v === "2" ? 2 : 1 })}
              options={[
                { value: "1", label: "Línea simple" },
                { value: "2", label: "Línea doble" },
              ]}
            />
            <div className="li-sub">Los iconos se eligen en el lector › Aspecto › Pantalla.</div>
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
              <div className="li-title">Ocultar la barra de notificaciones</div>
              <div className="li-sub">Pantalla completa al leer</div>
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
        <div className="section-title">Diccionario</div>
        <div className="list">
          <div className="list-item">
            <span className="li-icon">
              <BookA size={18} />
            </span>
            <span className="li-main">
              <div className="li-title">Mi diccionario</div>
              <div className="li-sub">{app.dictionary.length} {app.dictionary.length === 1 ? "palabra" : "palabras"} · se consulta al seleccionar texto › Definir</div>
            </span>
            <button className="btn btn-sm" onClick={() => void addWord()}>
              Agregar
            </button>
          </div>
          {[...app.dictionary]
            .sort((a, b) => a.word.localeCompare(b.word, "es"))
            .map((d) => (
              <div key={d.word} className="list-item">
                <span className="li-main">
                  <div className="li-title">{d.word}</div>
                  <div className="li-sub">{d.definition}</div>
                </span>
                <button className="icon-btn" aria-label={`Quitar ${d.word}`} onClick={() => setApp({ dictionary: app.dictionary.filter((x) => x.word !== d.word) })}>
                  <Trash size={16} />
                </button>
              </div>
            ))}
          <div className="list-item">
            <span className="li-main">
              <div className="li-title">Buscar en línea si no está</div>
              <div className="li-sub">Diccionario de la RAE</div>
            </span>
            <Switch on={app.onlineDictionary} onChange={(v) => setApp({ onlineDictionary: v })} />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">Dispositivo</div>
        <div className="list">
          <div className="list-item">
            <span className="li-main">
              <div className="li-title">Confirmar al recibir libros de otras apps</div>
              <div className="li-sub">Pregunta “Guardar archivo de libro” antes de agregarlo</div>
            </span>
            <Switch on={app.confirmExternalSave} onChange={(v) => setApp({ confirmExternalSave: v })} />
          </div>
          <div className="list-item col">
            <div className="li-title">Bordes táctiles inactivos · {reader.edgeGuard ? `${reader.edgeGuard} px` : "no"}</div>
            <div className="li-sub">Evita toques accidentales en pantallas completas o curvas</div>
            <Range value={reader.edgeGuard} min={0} max={40} step={2} onChange={(v) => setReader({ edgeGuard: v })} label="Borde inactivo" />
          </div>
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
              <div className="li-sub">EPUB, PDF, Kindle (MOBI/AZW3), Word (.docx), TXT, Markdown, HTML, FB2 y cómics CBZ</div>
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
