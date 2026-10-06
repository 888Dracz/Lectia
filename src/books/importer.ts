// Importa archivos a la biblioteca: detecta el formato, extrae título, autor y
// portada, y guarda el archivo original en el dispositivo.
import { putCover, putFile } from "../lib/db";
import { countWords } from "../lib/text";
import { baseName, uid } from "../lib/util";
import { useStore } from "../store/store";
import { detectFormat, loadBookData } from "./load";
import type { BookMeta, LoadedBook } from "./types";

export async function downscaleImage(blob: Blob, maxWidth = 480): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? blob), "image/jpeg", 0.86));
  } catch {
    return blob;
  }
}

async function estimateWords(loaded: LoadedBook): Promise<{ words: number; chapters: number }> {
  const c = loaded.content;
  if (c.kind === "pdf") {
    const sample = Math.min(c.numPages, 6);
    let words = 0;
    for (let i = 0; i < sample; i++) words += countWords(await c.getText(Math.floor((i * c.numPages) / sample)));
    return { words: sample ? Math.round((words / sample) * c.numPages) : 0, chapters: c.numPages };
  }
  if (c.fixedLayout) return { words: 0, chapters: c.chapters.length };
  let words = 0;
  for (let i = 0; i < c.chapters.length; i++) words += countWords(await c.getText(i));
  return { words, chapters: c.chapters.length };
}

export interface ImportResult {
  added: BookMeta[];
  skipped: { name: string; reason: string }[];
}

export async function importFiles(
  files: File[],
  onProgress?: (done: number, total: number, name: string) => void,
  extra: Partial<BookMeta> = {}
): Promise<ImportResult> {
  const result: ImportResult = { added: [], skipped: [] };
  const existing = Object.values(useStore.getState().books);
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i, files.length, file.name);
    try {
      if (existing.some((b) => b.fileName === file.name && b.fileSize === file.size)) {
        result.skipped.push({ name: file.name, reason: "Ya está en tu biblioteca" });
        continue;
      }
      const format = await detectFormat(file);
      const data = await file.arrayBuffer();
      // pdf.js se queda con el buffer, por eso se le pasa una copia.
      const loaded = await loadBookData(format, data.slice(0), file.name, true);
      const id = uid("b");
      const { words, chapters } = await estimateWords(loaded).catch(() => ({ words: 0, chapters: 0 }));
      let hasCover = false;
      if (loaded.info.cover) {
        await putCover(id, await downscaleImage(loaded.info.cover));
        hasCover = true;
      }
      loaded.content.dispose();
      await putFile(id, new Blob([data], { type: file.type || "application/octet-stream" }));
      const meta: BookMeta = {
        id,
        title: loaded.info.title?.trim() || baseName(file.name),
        author: loaded.info.author?.trim() || "",
        format,
        fileName: file.name,
        fileSize: file.size,
        hasCover,
        addedAt: Date.now(),
        status: "unread",
        favorite: false,
        collections: [],
        readingMs: 0,
        wordCount: words || undefined,
        chapterCount: chapters || undefined,
        description: loaded.info.description?.slice(0, 1200),
        language: loaded.info.language,
        ...extra,
      };
      useStore.getState().addBook(meta);
      existing.push(meta);
      result.added.push(meta);
    } catch (e) {
      console.error(e);
      result.skipped.push({ name: file.name, reason: e instanceof Error ? e.message : "No se pudo abrir" });
    }
  }
  onProgress?.(files.length, files.length, "");
  if (result.added.length) void navigator.storage?.persist?.().catch(() => false);
  return result;
}
