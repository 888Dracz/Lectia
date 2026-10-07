// Navegación por hash (#/leer/<id>, #/entrenar…) y manejo del botón "atrás"
// de Android para cerrar hojas y diálogos antes de salir de la pantalla.
import { useEffect, useRef, useSyncExternalStore } from "react";

export type Route =
  | { name: "library" }
  | { name: "reader"; bookId: string }
  | { name: "train" }
  | { name: "game"; game: string }
  | { name: "community"; tab: CommunityTab }
  | { name: "profile"; username?: string }
  | { name: "progress" }
  | { name: "settings" }
  | { name: "notebooks" }
  | { name: "notebook"; bookId: string }
  | { name: "readingList" };

export type CommunityTab = "league" | "friends" | "feed";

const COMMUNITY_TABS: Record<string, CommunityTab> = { liga: "league", amigos: "friends", novedades: "feed" };
const COMMUNITY_SLUGS: Record<CommunityTab, string> = { league: "liga", friends: "amigos", feed: "novedades" };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case "leer":
      return parts[1] ? { name: "reader", bookId: parts[1] } : { name: "library" };
    case "entrenar":
      return parts[1] ? { name: "game", game: parts[1] } : { name: "train" };
    case "comunidad":
      return { name: "community", tab: COMMUNITY_TABS[parts[1]] ?? "league" };
    case "perfil":
      return parts[1] ? { name: "profile", username: parts[1].toLowerCase() } : { name: "profile" };
    case "progreso":
      return { name: "progress" };
    case "ajustes":
      return { name: "settings" };
    case "cuadernos":
      return { name: "notebooks" };
    case "cuaderno":
      return parts[1] ? { name: "notebook", bookId: parts[1] } : { name: "notebooks" };
    case "por-leer":
      return { name: "readingList" };
    default:
      return { name: "library" };
  }
}

export function routeToHash(r: Route): string {
  switch (r.name) {
    case "reader":
      return `#/leer/${encodeURIComponent(r.bookId)}`;
    case "train":
      return "#/entrenar";
    case "game":
      return `#/entrenar/${encodeURIComponent(r.game)}`;
    case "community":
      return r.tab === "league" ? "#/comunidad" : `#/comunidad/${COMMUNITY_SLUGS[r.tab]}`;
    case "profile":
      return r.username ? `#/perfil/${encodeURIComponent(r.username)}` : "#/perfil";
    case "progress":
      return "#/progreso";
    case "settings":
      return "#/ajustes";
    case "notebooks":
      return "#/cuadernos";
    case "notebook":
      return `#/cuaderno/${encodeURIComponent(r.bookId)}`;
    case "readingList":
      return "#/por-leer";
    default:
      return "#/";
  }
}

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}

const isTopLevel = (r: Route) =>
  r.name === "library" || r.name === "notebooks" || r.name === "train" || r.name === "community" || r.name === "progress" || r.name === "settings";

/** Navega. Entre pestañas reemplaza el historial; hacia adentro lo apila. */
export function navigate(r: Route, opts: { replace?: boolean } = {}): void {
  const hash = routeToHash(r);
  if (window.location.hash === hash) return;
  const current = parseHash(window.location.hash);
  if (opts.replace || (isTopLevel(r) && isTopLevel(current))) {
    window.history.replaceState(null, "", hash);
  } else {
    window.history.pushState({ campanitaFrom: true }, "", hash);
  }
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/** Vuelve atrás dentro de la app; si se entró directo, va al destino por defecto. */
export function goBack(fallback: Route = { name: "library" }): void {
  if (window.history.state?.campanitaFrom) window.history.back();
  else navigate(fallback, { replace: true });
}

// --- Pila de "atrás" para hojas y diálogos -----------------------------------

interface BackEntry {
  id: number;
  close: () => void;
}

const stack: BackEntry[] = [];
let nextId = 1;
let ignorePops = 0;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", (e) => {
    if (ignorePops > 0) {
      ignorePops--;
      return;
    }
    // Se cierran las hojas abiertas después de la entrada a la que se volvió.
    const landed = (e.state && e.state.campanitaSheet) || 0;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].id > landed) stack.splice(i, 1)[0].close();
    }
  });
}

/**
 * Mientras `open` sea verdadero, el botón "atrás" del teléfono llama a
 * `onClose` en lugar de salir de la pantalla.
 */
export function useBackClose(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const entry: BackEntry = { id: nextId++, close: () => closeRef.current() };
    stack.push(entry);
    window.history.pushState({ campanitaSheet: entry.id }, "", window.location.href);
    return () => {
      const i = stack.indexOf(entry);
      if (i < 0) return; // ya se cerró con "atrás"
      stack.splice(i, 1);
      // Cerrada desde la interfaz: si su entrada sigue arriba, se quita.
      if (window.history.state?.campanitaSheet === entry.id) {
        ignorePops++;
        window.history.back();
      }
    };
  }, [open]);
}
