// Respaldo completo de la app en un archivo .zip:
//   lectia.json     → biblioteca, estanterías, cuadernos (subrayados, trazos,
//                     recortes, notas, marcadores), lista por leer, ajustes y progreso
//   libros/<id>     → archivos originales de los libros (opcional)
//   portadas/<id>   → portadas
//   medios/<id>     → imágenes de los cuadernos (recortes y trazos)
import { strFromU8, strToU8, unzip, zip, type Unzipped, type Zippable } from "fflate";
import { deleteCover, deleteFile, getCover, getFile, getMedia, putCover, putFile, putMedia } from "../lib/db";
import { dayKey } from "../lib/util";
import { migrateState, type PersistedState } from "../store/state";
import { flushSave, getPersisted, useStore } from "../store/store";

/** Registra que el respaldo ya se guardó o compartió. */
export function markBackupDone(): void {
  useStore.getState().setApp({ lastBackupAt: Date.now() });
}

export const BACKUP_APP = "lectia";
export const BACKUP_FORMAT = 1;

export interface BackupManifest {
  app: string;
  format: number;
  exportedAt: number;
  includesFiles: boolean;
  books: number;
}

export interface BackupJson {
  manifest: BackupManifest;
  state: PersistedState;
}

const MEDIA_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const EXT_MEDIA: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/** Imágenes que usan los cuadernos (recortes y vistas previas de trazos). */
export function mediaIds(state: PersistedState): string[] {
  const ids = new Set<string>();
  for (const c of state.clips) if (c.mediaId) ids.add(c.mediaId);
  for (const d of state.drawings) if (d.mediaId) ids.add(d.mediaId);
  return [...ids];
}

function zipAsync(files: Zippable): Promise<Uint8Array> {
  return new Promise((res, rej) => zip(files, { level: 0 }, (err, data) => (err ? rej(err) : res(data))));
}

function unzipAsync(data: Uint8Array): Promise<Unzipped> {
  return new Promise((res, rej) => unzip(data, (err, out) => (err ? rej(err) : res(out))));
}

export function backupFileName(includeFiles: boolean, date = new Date()): string {
  return `lectia-${includeFiles ? "respaldo" : "datos"}-${dayKey(date)}.zip`;
}

/** Arma el JSON del respaldo (puro, para poder probarlo). */
export function buildBackupJson(state: PersistedState, includesFiles: boolean, now = Date.now()): BackupJson {
  return {
    manifest: {
      app: BACKUP_APP,
      format: BACKUP_FORMAT,
      exportedAt: now,
      includesFiles,
      books: Object.keys(state.books).length,
    },
    state,
  };
}

export async function createBackup(
  includeFiles: boolean,
  onProgress?: (done: number, total: number) => void
): Promise<File> {
  flushSave();
  const state = getPersisted();
  const now = Date.now();
  const json = buildBackupJson({ ...state, app: { ...state.app, lastBackupAt: now } }, includeFiles, now);
  const files: Zippable = {
    "lectia.json": [strToU8(JSON.stringify(json, null, 1)), { level: 6 }],
    "LEEME.txt": [
      strToU8(
        "Respaldo de Lectia · Lector.\n" +
          "Para restaurarlo: abre Lectia → Ajustes → Restaurar respaldo y elige este archivo.\n" +
          "La carpeta libros/ contiene tus archivos originales y medios/ las imágenes de tus cuadernos.\n"
      ),
      { level: 6 },
    ],
  };
  const books = Object.values(state.books);
  let done = 0;
  for (const b of books) {
    const cover = await getCover(b.id);
    if (cover) files[`portadas/${b.id}.jpg`] = new Uint8Array(await cover.arrayBuffer());
    if (includeFiles) {
      const blob = await getFile(b.id);
      if (blob) files[`libros/${b.id}.${b.format}`] = new Uint8Array(await blob.arrayBuffer());
    }
    onProgress?.(++done, books.length);
  }
  for (const id of mediaIds(state)) {
    const blob = await getMedia(id);
    if (blob) files[`medios/${id}.${MEDIA_EXT[blob.type] ?? "png"}`] = new Uint8Array(await blob.arrayBuffer());
  }
  const data = await zipAsync(files);
  return new File([data.slice()], backupFileName(includeFiles), { type: "application/zip" });
}

export interface ParsedBackup {
  json: BackupJson;
  files: Map<string, Uint8Array>;
  covers: Map<string, Uint8Array>;
  media: Map<string, { data: Uint8Array; type: string }>;
}

export function parseBackupJson(text: string): BackupJson {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("El respaldo está dañado (JSON inválido).");
  }
  const j = raw as Partial<BackupJson>;
  if (!j?.manifest || (j.manifest.app !== BACKUP_APP && j.manifest.app !== "campanita-lector")) throw new Error("Este archivo no es un respaldo de Lectia.");
  if (j.manifest.format > BACKUP_FORMAT) throw new Error("El respaldo es de una versión más nueva de la app. Actualízala primero.");
  return { manifest: j.manifest, state: migrateState(j.state) };
}

export async function readBackup(file: Blob): Promise<ParsedBackup> {
  const entries = await unzipAsync(new Uint8Array(await file.arrayBuffer())).catch(() => {
    throw new Error("No se pudo leer el archivo. ¿Es un .zip de respaldo de Lectia?");
  });
  // También acepta respaldos hechos con la app anterior (Campanita).
  const jsonBytes = entries["lectia.json"] ?? entries["campanita.json"];
  if (!jsonBytes) throw new Error("Este archivo no es un respaldo de Lectia.");
  const json = parseBackupJson(strFromU8(jsonBytes));
  const files = new Map<string, Uint8Array>();
  const covers = new Map<string, Uint8Array>();
  const media = new Map<string, { data: Uint8Array; type: string }>();
  for (const [name, data] of Object.entries(entries)) {
    const m = /^(libros|portadas|medios)\/([^/.]+)\.(\w+)$/.exec(name);
    if (!m) continue;
    if (m[1] === "medios") media.set(m[2], { data, type: EXT_MEDIA[m[3].toLowerCase()] ?? "image/png" });
    else (m[1] === "libros" ? files : covers).set(m[2], data);
  }
  return { json, files, covers, media };
}

/** Combina dos estados: lo importado se suma a lo actual sin duplicar. */
export function mergeStates(current: PersistedState, incoming: PersistedState): PersistedState {
  const byId = <T extends { id: string }>(a: T[], b: T[]) => {
    const map = new Map(a.map((x) => [x.id, x]));
    for (const x of b) if (!map.has(x.id)) map.set(x.id, x);
    return [...map.values()];
  };
  const books = { ...current.books };
  for (const [id, b] of Object.entries(incoming.books)) {
    const cur = books[id];
    if (!cur) books[id] = b;
    else if ((b.location?.updatedAt ?? 0) > (cur.location?.updatedAt ?? 0)) books[id] = { ...cur, ...b };
  }
  const days = { ...current.progress.days };
  for (const [k, d] of Object.entries(incoming.progress.days)) {
    const c = days[k];
    days[k] = c
      ? { ...c, ms: Math.max(c.ms, d.ms), pages: Math.max(c.pages, d.pages), words: Math.max(c.words, d.words), games: Math.max(c.games, d.games), rsvpWords: Math.max(c.rsvpWords, d.rsvpWords), xp: Math.max(c.xp, d.xp), quests: [...new Set([...c.quests, ...d.quests])] }
      : d;
  }
  const notebooks = { ...current.notebooks };
  for (const [id, n] of Object.entries(incoming.notebooks)) {
    if (!notebooks[id] || n.updatedAt > notebooks[id].updatedAt) notebooks[id] = n;
  }
  const games = { ...current.progress.games };
  for (const [g, r] of Object.entries(incoming.progress.games)) {
    const c = games[g as keyof typeof games];
    games[g as keyof typeof games] = c && r ? { plays: Math.max(c.plays, r.plays), best: Math.max(c.best, r.best), lastAt: Math.max(c.lastAt, r.lastAt) } : c ?? r;
  }
  return {
    ...current,
    books,
    collections: byId(current.collections, incoming.collections),
    bookmarks: byId(current.bookmarks, incoming.bookmarks),
    highlights: byId(current.highlights, incoming.highlights),
    drawings: byId(current.drawings, incoming.drawings),
    clips: byId(current.clips, incoming.clips),
    looseNotes: byId(current.looseNotes, incoming.looseNotes),
    readingList: byId(current.readingList, incoming.readingList),
    notebooks,
    progress: {
      ...current.progress,
      xp: Math.max(current.progress.xp, incoming.progress.xp),
      achievements: { ...incoming.progress.achievements, ...current.progress.achievements },
      days,
      games,
      wpmHistory: [...current.progress.wpmHistory, ...incoming.progress.wpmHistory]
        .filter((s, i, arr) => arr.findIndex((x) => x.at === s.at) === i)
        .sort((a, b) => a.at - b.at)
        .slice(-100),
      totalPages: Math.max(current.progress.totalPages, incoming.progress.totalPages),
      totalRsvpWords: Math.max(current.progress.totalRsvpWords, incoming.progress.totalRsvpWords),
      bestRsvpWpm: Math.max(current.progress.bestRsvpWpm, incoming.progress.bestRsvpWpm),
      booksFinished: Math.max(current.progress.booksFinished, incoming.progress.booksFinished),
    },
  };
}

export async function restoreBackup(parsed: ParsedBackup, mode: "merge" | "replace"): Promise<{ books: number; missingFiles: number }> {
  const incoming = parsed.json.state;
  const current = getPersisted();
  const next = mode === "replace" ? incoming : mergeStates(current, incoming);
  if (mode === "replace") {
    for (const id of Object.keys(current.books)) {
      if (!incoming.books[id]) await Promise.all([deleteFile(id), deleteCover(id)]);
    }
  }
  for (const [id, data] of parsed.files) await putFile(id, new Blob([data.slice()]));
  for (const [id, data] of parsed.covers) await putCover(id, new Blob([data.slice()], { type: "image/jpeg" }));
  for (const [id, m] of parsed.media) await putMedia(id, new Blob([m.data.slice()], { type: m.type }));
  // Los libros sin archivo (respaldo "solo datos") se conservan si ya existen aquí.
  let missingFiles = 0;
  for (const id of Object.keys(incoming.books)) {
    if (!parsed.files.has(id) && !(await getFile(id))) missingFiles++;
  }
  useStore.getState().replaceState(next);
  flushSave();
  return { books: Object.keys(incoming.books).length, missingFiles };
}

/** Ofrece el archivo para guardar o compartir (Drive, correo…) según el dispositivo. */
export async function deliverFile(file: File, preferShare = false): Promise<"shared" | "downloaded"> {
  if (preferShare && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return "shared";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "shared";
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return "downloaded";
}
