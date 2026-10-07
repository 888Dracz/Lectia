// Avisos del store para otras partes de la app (p. ej. la comunidad publica
// en Novedades cuando terminas un libro o alcanzas una racha).

export type StoreEvent =
  | { type: "book-finished"; bookId: string }
  | { type: "achievement"; id: string }
  | { type: "level"; level: number }
  | { type: "streak-day"; streak: number }
  | { type: "freeze-used"; days: number; streak: number };

type Listener = (e: StoreEvent) => void;

const listeners = new Set<Listener>();

export function onStoreEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitStoreEvent(e: StoreEvent): void {
  for (const l of listeners) {
    try {
      l(e);
    } catch (err) {
      console.error(err);
    }
  }
}
