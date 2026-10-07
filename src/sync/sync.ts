// Sincronización del progreso, marcadores y notas con la nube (WebDAV, Dropbox,
// Google Drive y FTP a través de una pasarela HTTP/WebDAV).
// Se guarda un solo archivo, lectia-sync.json. Los libros se emparejan por
// nombre de archivo + tamaño, porque cada dispositivo les da un id distinto.
import type { BookMeta } from "../books/types";
import type { Bookmark, Highlight, PersistedState, SyncConfig } from "../store/state";
import { flushSave, getPersisted, useStore } from "../store/store";

export const SYNC_FILE = "lectia-sync.json";

interface SyncBook {
  title: string;
  location?: BookMeta["location"];
  readingMs: number;
  status: BookMeta["status"];
  finishedAt?: number;
  history?: BookMeta["history"];
}

export interface SyncPayload {
  app: "lectia-sync";
  version: 1;
  at: number;
  books: Record<string, SyncBook>;
  bookmarks: (Omit<Bookmark, "bookId"> & { book: string })[];
  highlights: (Omit<Highlight, "bookId"> & { book: string })[];
}

export const bookKey = (b: Pick<BookMeta, "fileName" | "fileSize">) => `${b.fileName}|${b.fileSize}`;

export function buildPayload(state: PersistedState, now = Date.now()): SyncPayload {
  const keyOf = new Map(Object.values(state.books).map((b) => [b.id, bookKey(b)]));
  const books: Record<string, SyncBook> = {};
  for (const b of Object.values(state.books)) {
    books[bookKey(b)] = { title: b.title, location: b.location, readingMs: b.readingMs, status: b.status, finishedAt: b.finishedAt, history: b.history };
  }
  return {
    app: "lectia-sync",
    version: 1,
    at: now,
    books,
    bookmarks: state.bookmarks.filter((x) => keyOf.has(x.bookId)).map(({ bookId, ...rest }) => ({ ...rest, book: keyOf.get(bookId)! })),
    highlights: state.highlights.filter((x) => keyOf.has(x.bookId)).map(({ bookId, ...rest }) => ({ ...rest, book: keyOf.get(bookId)! })),
  };
}

/** Aplica lo descargado sobre el estado local: gana la posición más reciente; marcadores y notas se suman. */
export function mergePayload(state: PersistedState, remote: SyncPayload): { state: PersistedState; matched: number } {
  const idOf = new Map(Object.values(state.books).map((b) => [bookKey(b), b.id]));
  const books = { ...state.books };
  let matched = 0;
  for (const [key, rb] of Object.entries(remote.books ?? {})) {
    const id = idOf.get(key);
    if (!id) continue;
    matched++;
    const lb = books[id];
    const remoteNewer = (rb.location?.updatedAt ?? 0) > (lb.location?.updatedAt ?? 0);
    const history = { ...(rb.history ?? {}) };
    for (const [day, h] of Object.entries(lb.history ?? {})) {
      const r = history[day];
      history[day] = r ? { ms: Math.max(r.ms, h.ms), from: Math.min(r.from, h.from), to: Math.max(r.to, h.to) } : h;
    }
    books[id] = {
      ...lb,
      ...(remoteNewer ? { location: rb.location, status: rb.status === "finished" || lb.status === "finished" ? "finished" : rb.status } : {}),
      readingMs: Math.max(lb.readingMs, rb.readingMs ?? 0),
      finishedAt: lb.finishedAt ?? rb.finishedAt,
      history,
    };
  }
  const union = <T extends { id: string }>(local: T[], incoming: T[]) => {
    const ids = new Set(local.map((x) => x.id));
    return [...local, ...incoming.filter((x) => !ids.has(x.id))];
  };
  const bookmarks = union(
    state.bookmarks,
    (remote.bookmarks ?? []).filter((x) => idOf.has(x.book)).map(({ book, ...rest }) => ({ ...rest, bookId: idOf.get(book)! }))
  );
  const highlights = union(
    state.highlights,
    (remote.highlights ?? []).filter((x) => idOf.has(x.book)).map(({ book, ...rest }) => ({ ...rest, bookId: idOf.get(book)! }))
  );
  return { state: { ...state, books, bookmarks, highlights }, matched };
}

// --- Proveedores -----------------------------------------------------------------

interface Provider {
  download(): Promise<SyncPayload | null>;
  upload(p: SyncPayload): Promise<void>;
}

const joinUrl = (base: string, file: string) => `${base.replace(/\/+$/, "")}/${file}`;

function httpError(res: Response, what: string): Error {
  if (res.status === 401 || res.status === 403) return new Error(`${what}: usuario, contraseña o token incorrectos.`);
  return new Error(`${what}: el servidor respondió ${res.status}.`);
}

function webdav(c: SyncConfig): Provider {
  if (!/^https?:\/\//i.test(c.url)) throw new Error("Escribe la dirección del servidor (https://…).");
  const headers: Record<string, string> = {};
  if (c.user || c.password) headers.Authorization = `Basic ${btoa(unescape(encodeURIComponent(`${c.user}:${c.password}`)))}`;
  const url = joinUrl(c.url, SYNC_FILE);
  return {
    async download() {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (res.status === 404) return null;
      if (!res.ok) throw httpError(res, "No se pudo descargar");
      return (await res.json()) as SyncPayload;
    },
    async upload(p) {
      const res = await fetch(url, { method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(p) });
      if (!res.ok) throw httpError(res, "No se pudo subir");
    },
  };
}

function dropbox(c: SyncConfig): Provider {
  if (!c.token) throw new Error("Pega un token de acceso de Dropbox.");
  const auth = { Authorization: `Bearer ${c.token}` };
  const path = `/${SYNC_FILE}`;
  return {
    async download() {
      const res = await fetch("https://content.dropboxapi.com/2/files/download", {
        method: "POST",
        headers: { ...auth, "Dropbox-API-Arg": JSON.stringify({ path }) },
      });
      if (res.status === 409) return null;
      if (!res.ok) throw httpError(res, "Dropbox");
      return (await res.json()) as SyncPayload;
    },
    async upload(p) {
      const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/octet-stream", "Dropbox-API-Arg": JSON.stringify({ path, mode: "overwrite", mute: true }) },
        body: JSON.stringify(p),
      });
      if (!res.ok) throw httpError(res, "Dropbox");
    },
  };
}

function gdrive(c: SyncConfig): Provider {
  if (!c.token) throw new Error("Pega un token de acceso de Google Drive (permiso drive.appdata).");
  const auth = { Authorization: `Bearer ${c.token}` };
  const findId = async (): Promise<string | null> => {
    const q = encodeURIComponent(`name='${SYNC_FILE}'`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)`, { headers: auth });
    if (!res.ok) throw httpError(res, "Google Drive");
    const j = (await res.json()) as { files?: { id: string }[] };
    return j.files?.[0]?.id ?? null;
  };
  return {
    async download() {
      const id = await findId();
      if (!id) return null;
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: auth });
      if (!res.ok) throw httpError(res, "Google Drive");
      return (await res.json()) as SyncPayload;
    },
    async upload(p) {
      const id = await findId();
      const body = JSON.stringify(p);
      let res: Response;
      if (id) {
        res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
          method: "PATCH",
          headers: { ...auth, "Content-Type": "application/json" },
          body,
        });
      } else {
        const boundary = "lectia" + Math.random().toString(36).slice(2);
        const multipart =
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: SYNC_FILE, parents: ["appDataFolder"] })}\r\n` +
          `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
        res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
          method: "POST",
          headers: { ...auth, "Content-Type": `multipart/related; boundary=${boundary}` },
          body: multipart,
        });
      }
      if (!res.ok) throw httpError(res, "Google Drive");
    },
  };
}

function ftp(c: SyncConfig): Provider {
  // Los navegadores no hablan FTP: se usa la pasarela HTTP/WebDAV del servidor.
  if (/^ftps?:\/\//i.test(c.url)) {
    throw new Error(
      "Los navegadores no pueden conectarse por FTP directamente. Usa la dirección https:// (WebDAV/HTTP) que ofrece tu servidor FTP, o un servicio puente."
    );
  }
  return webdav(c);
}

export function providerFor(c: SyncConfig): Provider {
  switch (c.provider) {
    case "webdav":
      return webdav(c);
    case "dropbox":
      return dropbox(c);
    case "gdrive":
      return gdrive(c);
    case "ftp":
      return ftp(c);
    default:
      throw new Error("Elige un servicio de sincronización.");
  }
}

export type SyncDirection = "both" | "upload" | "download";

/** Sincroniza en la dirección indicada y devuelve un resumen. */
export async function runSync(direction: SyncDirection = "both"): Promise<string> {
  const cfg = useStore.getState().app.sync;
  const provider = providerFor(cfg);
  flushSave();
  let summary = "";
  if (direction !== "upload") {
    const remote = await provider.download();
    if (remote && remote.app === "lectia-sync") {
      const { state, matched } = mergePayload(getPersisted(), remote);
      useStore.getState().replaceState(state);
      flushSave();
      summary = `${matched} ${matched === 1 ? "libro actualizado" : "libros actualizados"} desde la nube`;
    } else summary = "La nube aún no tenía datos";
  }
  if (direction !== "download") {
    await provider.upload(buildPayload(getPersisted()));
    summary = summary ? `${summary} · datos subidos` : "Datos subidos a la nube";
  }
  useStore.getState().setApp({ sync: { ...useStore.getState().app.sync, lastSyncAt: Date.now() } });
  return summary;
}
