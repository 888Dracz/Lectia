// Base de datos local (IndexedDB). Guarda los archivos de los libros, las
// portadas, el estado de la app y la "bandeja" de archivos compartidos desde
// otras apps (Web Share Target). Este módulo también lo usa el service worker.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface InboxItem {
  id: string;
  file: File;
  receivedAt: number;
}

interface CampanitaDB extends DBSchema {
  files: { key: string; value: Blob };
  covers: { key: string; value: Blob };
  kv: { key: string; value: unknown };
  inbox: { key: string; value: InboxItem };
}

const DB_NAME = "campanita";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<CampanitaDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<CampanitaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CampanitaDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
        if (!db.objectStoreNames.contains("covers")) db.createObjectStore("covers");
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("inbox")) db.createObjectStore("inbox", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

export async function getFile(id: string): Promise<Blob | undefined> {
  return (await getDb()).get("files", id);
}

export async function putFile(id: string, blob: Blob): Promise<void> {
  await (await getDb()).put("files", blob, id);
}

export async function deleteFile(id: string): Promise<void> {
  await (await getDb()).delete("files", id);
}

export async function listFileIds(): Promise<string[]> {
  return (await getDb()).getAllKeys("files");
}

export async function getCover(id: string): Promise<Blob | undefined> {
  return (await getDb()).get("covers", id);
}

export async function putCover(id: string, blob: Blob): Promise<void> {
  await (await getDb()).put("covers", blob, id);
}

export async function deleteCover(id: string): Promise<void> {
  await (await getDb()).delete("covers", id);
}

export async function getKV<T>(key: string): Promise<T | undefined> {
  return (await getDb()).get("kv", key) as Promise<T | undefined>;
}

export async function setKV(key: string, value: unknown): Promise<void> {
  await (await getDb()).put("kv", value, key);
}

export async function addInbox(item: InboxItem): Promise<void> {
  await (await getDb()).put("inbox", item);
}

export async function takeInbox(): Promise<InboxItem[]> {
  const db = await getDb();
  const items = await db.getAll("inbox");
  await db.clear("inbox");
  return items.sort((a, b) => a.receivedAt - b.receivedAt);
}

export async function clearEverything(): Promise<void> {
  const db = await getDb();
  await Promise.all([db.clear("files"), db.clear("covers"), db.clear("kv"), db.clear("inbox")]);
}
