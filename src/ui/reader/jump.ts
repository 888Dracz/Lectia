// Salto pendiente al abrir el lector desde un cuaderno (ir a un subrayado,
// un recorte o un trazo concretos).
import type { NotebookEntry } from "../../notes/notebook";
import type { GoTarget } from "./ReflowView";

let pending: { bookId: string; target: GoTarget } | null = null;

export function setPendingJump(bookId: string, target: GoTarget): void {
  pending = { bookId, target };
}

export function takePendingJump(bookId: string): GoTarget | null {
  if (pending?.bookId !== bookId) return null;
  const t = pending.target;
  pending = null;
  return t;
}

/** A dónde lleva una entrada del cuaderno (null si no tiene lugar en el libro). */
export function entryTarget(e: NotebookEntry): GoTarget | null {
  switch (e.kind) {
    case "highlight":
      return { chapter: e.item.chapter, offset: e.item.start, flash: e.item.end - e.item.start };
    case "bookmark":
      return { chapter: e.item.chapter, fraction: e.item.fraction };
    case "drawing": {
      const a = e.item.strokes[0]?.anchor;
      return a?.kind === "text" ? { chapter: e.item.chapter, offset: a.offset } : { chapter: e.item.chapter, fraction: e.item.view === "page" ? 0 : e.item.fraction };
    }
    case "clip":
      return e.item.offset !== undefined ? { chapter: e.item.chapter, offset: e.item.offset } : { chapter: e.item.chapter, fraction: e.item.fraction };
    case "note":
      return e.item.chapter !== undefined ? { chapter: e.item.chapter, fraction: e.item.fraction ?? 0 } : null;
  }
}
