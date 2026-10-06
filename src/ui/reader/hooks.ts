import { useEffect, useReducer, useRef } from "react";
import { formatDuration } from "../../lib/util";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";

const TICK = 5000;
const IDLE_LIMIT = 3 * 60000;

/**
 * Cuenta el tiempo de lectura activa (pantalla visible y con actividad
 * reciente o con lectura en voz alta) y lo registra en las estadísticas.
 */
export function useReadingSession(bookId: string | undefined, activeExternally: () => boolean) {
  const acc = useRef({ ms: 0, pages: 0, sessionMs: 0, lastActivity: Date.now() });
  const ext = useRef(activeExternally);
  ext.current = activeExternally;

  useEffect(() => {
    if (!bookId) return;
    const a = acc.current;
    a.lastActivity = Date.now();
    const mark = () => {
      a.lastActivity = Date.now();
    };
    const flush = () => {
      if (a.ms > 0 || a.pages > 0) {
        useStore.getState().logReading(bookId, a.ms, a.pages);
        a.ms = 0;
        a.pages = 0;
      }
    };
    const interval = setInterval(() => {
      const visible = document.visibilityState === "visible";
      const active = Date.now() - a.lastActivity < IDLE_LIMIT || ext.current();
      if (visible && active) {
        a.ms += TICK;
        a.sessionMs += TICK;
      }
      if (a.ms >= 60000) flush();
    }, TICK);
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
      else mark();
    };
    window.addEventListener("pointerdown", mark, { passive: true });
    window.addEventListener("keydown", mark);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(interval);
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
      document.removeEventListener("visibilitychange", onVis);
      flush();
      if (a.sessionMs >= 60000) toast(`Sesión de lectura: ${formatDuration(a.sessionMs)}`, { icon: "📖" });
      a.sessionMs = 0;
    };
  }, [bookId]);

  return {
    pageTurned: () => {
      acc.current.pages++;
      acc.current.lastActivity = Date.now();
    },
  };
}

/** Mantiene la pantalla encendida mientras se lee (si el navegador lo permite). */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const request = async () => {
      try {
        if (document.visibilityState === "visible") lock = await navigator.wakeLock.request("screen");
        if (!alive) void lock?.release();
      } catch {
        /* no disponible */
      }
    };
    void request();
    const onVis = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => undefined);
    };
  }, [enabled]);
}

/** Cambia el color de la barra de estado del teléfono mientras se lee. */
export function useThemeColor(color: string) {
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const prev = meta.getAttribute("content");
    meta.setAttribute("content", color);
    return () => {
      if (prev) meta.setAttribute("content", prev);
    };
  }, [color]);
}

/** Hora y batería para la barra de estado del lector. */
export function useClockBattery(): { time: string; battery: number | null } {
  const ref = useRef({ time: "", battery: null as number | null });
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const upd = () => {
      ref.current.time = new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
      force();
    };
    upd();
    const t = setInterval(upd, 20000);
    type Battery = { level: number; addEventListener: (e: string, f: () => void) => void; removeEventListener: (e: string, f: () => void) => void };
    const nav = navigator as Navigator & { getBattery?: () => Promise<Battery> };
    let cleanup = () => {};
    void nav.getBattery?.().then((b) => {
      const onLevel = () => {
        ref.current.battery = Math.round(b.level * 100);
        force();
      };
      onLevel();
      b.addEventListener("levelchange", onLevel);
      cleanup = () => b.removeEventListener("levelchange", onLevel);
    }).catch(() => undefined);
    return () => {
      clearInterval(t);
      cleanup();
    };
  }, []);
  return ref.current;
}
