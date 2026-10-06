// FictionBook 2 (.fb2): XML con el texto, metadatos e imágenes en base64.
import { escapeHtml } from "../../lib/util";
import { sanitizeHtml, type HtmlChapter } from "../html";
import { reflowFromChapters } from "../reflow";
import type { BookInfo, LoadedBook } from "../types";
import { decodeText } from "./text";

const local = (el: Element) => (el.localName || el.nodeName).replace(/^.*:/, "").toLowerCase();
const kids = (el: Element, name?: string) => Array.from(el.children).filter((c) => !name || local(c) === name);

export async function loadFb2(data: ArrayBuffer, fileTitle: string): Promise<LoadedBook> {
  const head = new TextDecoder("ascii").decode(new Uint8Array(data).slice(0, 200));
  const enc = /encoding=["']([\w-]+)["']/i.exec(head)?.[1];
  const xml = new DOMParser().parseFromString(decodeText(data, enc), "application/xml");
  if (xml.getElementsByTagName("parsererror").length) throw new Error("El archivo FB2 está dañado.");

  const binaries = new Map<string, { type: string; data: string }>();
  for (const b of Array.from(xml.getElementsByTagName("*")).filter((e) => local(e) === "binary")) {
    binaries.set(b.getAttribute("id") ?? "", { type: b.getAttribute("content-type") ?? "image/jpeg", data: (b.textContent ?? "").replace(/\s+/g, "") });
  }
  const imageSrc = (href: string | null) => {
    if (!href) return null;
    const bin = binaries.get(href.replace(/^#/, ""));
    return bin ? `data:${bin.type};base64,${bin.data}` : null;
  };
  const hrefOf = (el: Element) =>
    el.getAttribute("l:href") ?? el.getAttribute("xlink:href") ?? el.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? el.getAttribute("href");

  const all = Array.from(xml.getElementsByTagName("*"));
  const titleInfo = all.find((e) => local(e) === "title-info");
  const info: BookInfo = {};
  if (titleInfo) {
    info.title = kids(titleInfo, "book-title")[0]?.textContent?.trim() || undefined;
    info.author =
      kids(titleInfo, "author")
        .map((a) => ["first-name", "middle-name", "last-name"].map((n) => kids(a, n)[0]?.textContent?.trim()).filter(Boolean).join(" ") || kids(a, "nickname")[0]?.textContent?.trim())
        .filter(Boolean)
        .join(", ") || undefined;
    info.language = kids(titleInfo, "lang")[0]?.textContent?.trim() || undefined;
    info.description = kids(titleInfo, "annotation")[0]?.textContent?.replace(/\s+/g, " ").trim() || undefined;
    const coverImg = kids(titleInfo, "coverpage")[0]?.children[0];
    const bin = coverImg ? binaries.get((hrefOf(coverImg) ?? "").replace(/^#/, "")) : undefined;
    if (bin) {
      const bytes = Uint8Array.from(atob(bin.data), (c) => c.charCodeAt(0));
      info.cover = new Blob([bytes], { type: bin.type });
    }
  }

  const toHtml = (el: Element): string => {
    let out = "";
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        out += escapeHtml(n.nodeValue ?? "");
        continue;
      }
      if (n.nodeType !== 1) continue;
      const c = n as Element;
      const inner = () => toHtml(c);
      const id = c.getAttribute("id") ? ` id="${escapeHtml(c.getAttribute("id")!)}"` : "";
      switch (local(c)) {
        case "p": out += `<p${id}>${inner()}</p>`; break;
        case "title": out += `<h2${id}>${kids(c, "p").map((p) => toHtml(p)).join("<br>") || inner()}</h2>`; break;
        case "subtitle": out += `<h3${id}>${inner()}</h3>`; break;
        case "emphasis": out += `<em>${inner()}</em>`; break;
        case "strong": out += `<strong>${inner()}</strong>`; break;
        case "strikethrough": out += `<s>${inner()}</s>`; break;
        case "sub": out += `<sub>${inner()}</sub>`; break;
        case "sup": out += `<sup>${inner()}</sup>`; break;
        case "code": out += `<code>${inner()}</code>`; break;
        case "empty-line": out += "<br>"; break;
        case "epigraph": out += `<blockquote class="epigraph"${id}>${inner()}</blockquote>`; break;
        case "cite": out += `<blockquote${id}>${inner()}</blockquote>`; break;
        case "text-author": out += `<p data-a="r"><em>${inner()}</em></p>`; break;
        case "poem": out += `<div data-poem="1"${id}>${inner()}</div>`; break;
        case "stanza": out += `<div data-stanza="1">${inner()}</div>`; break;
        case "v": out += `<p data-verse="1">${inner()}</p>`; break;
        case "image": {
          const src = imageSrc(hrefOf(c));
          if (src) out += `<img src="${src}" alt="">`;
          break;
        }
        case "a": {
          const href = hrefOf(c) ?? "";
          out += `<a href="${escapeHtml(href)}">${inner()}</a>`;
          break;
        }
        case "section": out += `<section${id}>${inner()}</section>`; break;
        case "table": out += `<table>${inner()}</table>`; break;
        case "tr": out += `<tr>${inner()}</tr>`; break;
        case "td": out += `<td>${inner()}</td>`; break;
        case "th": out += `<th>${inner()}</th>`; break;
        default: out += inner();
      }
    }
    return out;
  };

  const bodies = all.filter((e) => local(e) === "body");
  const main = bodies.find((b) => !b.getAttribute("name")) ?? bodies[0];
  const chapters: HtmlChapter[] = [];
  if (main) {
    let sections = kids(main, "section");
    if (sections.length === 1 && kids(sections[0], "section").length > 1) {
      const intro = kids(sections[0]).filter((c) => local(c) !== "section");
      if (intro.length) chapters.push({ title: info.title ?? fileTitle, html: intro.map((c) => toHtml(wrap(c))).join("") });
      sections = kids(sections[0], "section");
    }
    const preface = kids(main).filter((c) => local(c) !== "section");
    if (preface.length) chapters.push({ title: info.title ?? fileTitle, html: preface.map((c) => toHtml(wrap(c))).join("") });
    sections.forEach((s, i) => {
      const t = kids(s, "title")[0]?.textContent?.replace(/\s+/g, " ").trim();
      chapters.push({ title: t || `Capítulo ${i + 1}`, html: toHtml(s) });
    });
  }
  for (const notes of bodies.filter((b) => b !== main)) {
    chapters.push({ title: notes.getAttribute("name") === "notes" ? "Notas" : "Anexo", html: toHtml(notes) });
  }
  if (!chapters.length) throw new Error("El FB2 no tiene texto.");

  const clean = chapters.map((c) => ({ title: c.title, html: sanitizeHtml(c.html) }));
  return { content: reflowFromChapters(clean), info };
}

/** Envuelve un elemento suelto para que `toHtml` lo procese como hijo. */
function wrap(el: Element): Element {
  const w = el.ownerDocument.createElement("wrap");
  w.appendChild(el.cloneNode(true));
  return w;
}
