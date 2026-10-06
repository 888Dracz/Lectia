// Cómics en .cbz (un zip de imágenes): cada imagen es una página.
import { unzipSync } from "fflate";
import type { LoadedBook, ReflowContent } from "../types";

const IMG = /\.(jpe?g|png|gif|webp|avif)$/i;
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif" };

export async function loadCbz(data: ArrayBuffer): Promise<LoadedBook> {
  const zip = unzipSync(new Uint8Array(data), { filter: (f) => IMG.test(f.name) && !/(^|\/)(__MACOSX|\.)/.test(f.name) });
  const names = Object.keys(zip).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  if (!names.length) throw new Error("El cómic no contiene imágenes.");
  const blobFor = (name: string) => new Blob([zip[name].slice()], { type: TYPES[name.split(".").pop()!.toLowerCase()] ?? "image/jpeg" });
  const urls = new Map<number, string>();
  const content: ReflowContent = {
    kind: "reflow",
    fixedLayout: true,
    chapters: names.map((_, i) => ({ title: `Página ${i + 1}`, size: 1 })),
    toc: names.map((_, i) => ({ title: `Página ${i + 1}`, chapter: i, level: 0 })),
    async getHtml(i) {
      if (!names[i]) return "";
      if (!urls.has(i)) urls.set(i, URL.createObjectURL(blobFor(names[i])));
      return `<div class="rd-fixed-page"><img src="${urls.get(i)}" alt="Página ${i + 1}"></div>`;
    },
    async getText() {
      return "";
    },
    dispose() {
      for (const u of urls.values()) URL.revokeObjectURL(u);
      urls.clear();
    },
  };
  return { content, info: { cover: blobFor(names[0]) } };
}
