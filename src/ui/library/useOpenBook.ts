import { navigate } from "../../lib/router";
import { useStore } from "../../store/store";

/** Abre un libro en el lector (y pantalla completa si está activado). */
export function openBook(id: string) {
  const { reader } = useStore.getState();
  if (reader.fullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined);
  }
  useStore.getState().updateBook(id, { lastOpenedAt: Date.now() });
  navigate({ name: "reader", bookId: id });
}

export function remainingMinutes(wordCount: number | undefined, percent: number): number | null {
  if (!wordCount) return null;
  return Math.max(1, Math.round((wordCount * (1 - percent)) / 230));
}

export function formatRemaining(min: number | null): string {
  if (min === null) return "";
  if (min < 60) return `≈ ${min} min para terminar`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `≈ ${h} h${m ? ` ${m} min` : ""} para terminar`;
}
