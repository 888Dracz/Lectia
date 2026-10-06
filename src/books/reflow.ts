import { htmlToFlatText, htmlToText, type HtmlChapter } from "./html";
import type { ReflowContent, TocItem } from "./types";

interface Options {
  toc?: TocItem[];
  fixedLayout?: boolean;
  onDispose?: () => void;
  resolveHref?: ReflowContent["resolveHref"];
}

/** Construye un contenido fluido a partir de capítulos HTML ya limpios. */
export function reflowFromChapters(chapters: HtmlChapter[], opts: Options = {}): ReflowContent {
  const texts = new Map<number, string>();
  const anchors = new Map<string, number>();
  chapters.forEach((c, i) => {
    for (const m of c.html.matchAll(/\sid="([^"]+)"/g)) if (!anchors.has(m[1])) anchors.set(m[1], i);
  });
  return {
    kind: "reflow",
    chapters: chapters.map((c) => ({
      title: c.title,
      size: opts.fixedLayout ? 1 : Math.max(1, htmlToFlatText(c.html).length),
    })),
    toc: opts.toc ?? chapters.map((c, i) => ({ title: c.title, chapter: i, level: 0 })),
    fixedLayout: opts.fixedLayout,
    async getHtml(i) {
      return chapters[i]?.html ?? "";
    },
    async getText(i) {
      if (!texts.has(i)) texts.set(i, htmlToText(chapters[i]?.html ?? ""));
      return texts.get(i)!;
    },
    resolveHref:
      opts.resolveHref ??
      ((href) => {
        const hash = href.indexOf("#");
        if (hash < 0) return null;
        const anchor = decodeURIComponent(href.slice(hash + 1));
        const chapter = anchors.get(anchor);
        return chapter === undefined ? null : { chapter, anchor };
      }),
    dispose() {
      opts.onDispose?.();
    },
  };
}
