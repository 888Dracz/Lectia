// Documentos de Word (.docx) convertidos a HTML con mammoth.
import { strFromU8, unzipSync } from "fflate";
import { sanitizeHtml, splitHtmlIntoChapters } from "../html";
import { reflowFromChapters } from "../reflow";
import type { BookInfo, LoadedBook } from "../types";

function readCoreProps(data: ArrayBuffer): BookInfo {
  try {
    const zip = unzipSync(new Uint8Array(data), { filter: (f) => f.name === "docProps/core.xml" });
    const xml = zip["docProps/core.xml"];
    if (!xml) return {};
    const doc = new DOMParser().parseFromString(strFromU8(xml), "application/xml");
    const get = (tag: string) => doc.getElementsByTagName(tag)[0]?.textContent?.trim() || undefined;
    return { title: get("dc:title"), author: get("dc:creator"), description: get("dc:description") };
  } catch {
    return {};
  }
}

export async function loadDocx(data: ArrayBuffer, fileTitle: string): Promise<LoadedBook> {
  const info = readCoreProps(data);
  const mammoth = (await import("mammoth/mammoth.browser.min.js")).default;
  const result = await mammoth.convertToHtml(
    { arrayBuffer: data },
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Título'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Quote'] => blockquote:fresh",
        "p[style-name='Cita'] => blockquote:fresh",
      ],
    }
  );
  const clean = sanitizeHtml(result.value);
  const chapters = splitHtmlIntoChapters(clean, info.title ?? fileTitle);
  return { content: reflowFromChapters(chapters), info };
}
