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
export function useReadingSession(bookId: string | undefined, activeExternally: () => boolean, percent: () => number | undefined = () => undefined) {
  const acc = useRef({ ms: 0, pages: 0, sessionMs: 0, lastActivity: Date.now() });
  const ext = useRef(activeExternally);
  ext.current = activeExternally;
  const pct = useRef(percent);
  pct.current = percent;

  useEffect(() => {
    if (!bookId) return;
    const a = acc.current;
    a.lastActivity = Date.now();
    const mark = () => {
      a.lastActivity = Date.now();
    };
    const flush = () => {
      if (a.ms > 0 || a.pages > 0) {
        useStore.getState().logReading(bookId, a.ms, a.pages, pct.current());
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
    /** Tiempo leído en esta sesión (ms), para el recordatorio de descanso. */
    sessionMs: () => acc.current.sessionMs,
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

/** Pasa página inclinando el teléfono hacia un lado y volviendo al centro. */
export function useTiltPaging(enabled: boolean, threshold: number, onNext: () => void, onPrev: () => void) {
  const cb = useRef({ onNext, onPrev });
  cb.current = { onNext, onPrev };
  useEffect(() => {
    if (!enabled || typeof DeviceOrientationEvent === "undefined") return;
    let armed = true;
    let base: number | null = null;
    let last = 0;
    const onTilt = (e: DeviceOrientationEvent) => {
      const landscape = Math.abs((screen.orientation?.angle ?? 0) % 180) === 90;
      const v = landscape ? e.beta : e.gamma;
      if (v === null || v === undefined) return;
      if (base === null) base = v;
      const d = v - base;
      if (armed && Math.abs(d) > threshold && Date.now() - last > 700) {
        armed = false;
        last = Date.now();
        if (d > 0) cb.current.onNext();
        else cb.current.onPrev();
      } else if (Math.abs(d) < threshold * 0.4) armed = true;
      // La posición "neutra" se adapta despacio a cómo se sostiene el teléfono.
      if (armed) base = base * 0.98 + v * 0.02;
    };
    window.addEventListener("deviceorientation", onTilt);
    return () => window.removeEventListener("deviceorientation", onTilt);
  }, [enabled, threshold]);
}

/** iPhone pide permiso para leer los sensores de movimiento. */
export async function requestMotionPermission(): Promise<boolean> {
  const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof D?.requestPermission !== "function") return typeof DeviceOrientationEvent !== "undefined";
  try {
    return (await D.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

let audioCtx: AudioContext | null = null;

/** Sonido corto de hoja de papel (ruido filtrado), sin archivos de audio. */
export function playPageSound(volume: number): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const dur = 0.22;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2) * Math.min(1, t * 18);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2400;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume)) * 0.6;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  } catch {
    /* sin audio */
  }
}

/** Avisos de salud visual: descanso tras N minutos y alertas a horas fijas. */
export function useHealthAlerts(breakMin: number, times: string[], sessionMs: () => number, onAlert: (title: string, text: string) => void) {
  const cb = useRef({ sessionMs, onAlert });
  cb.current = { sessionMs, onAlert };
  useEffect(() => {
    let nextBreak = breakMin > 0 ? breakMin * 60000 : Infinity;
    const fired = new Set<string>();
    const t = setInterval(() => {
      const ms = cb.current.sessionMs();
      if (ms >= nextBreak) {
        nextBreak = ms + breakMin * 60000;
        cb.current.onAlert("Hora de descansar la vista", `Llevas ${Math.round(ms / 60000)} minutos leyendo. Mira algo lejano durante 20 segundos.`);
      }
      const now = new Date();
      const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const key = `${now.toDateString()} ${hm}`;
      if (times.includes(hm) && !fired.has(key)) {
        fired.add(key);
        cb.current.onAlert("Alerta de lectura", `Son las ${hm}.`);
      }
    }, 15000);
    return () => clearInterval(t);
  }, [breakMin, times.join(",")]);
}

/** Muestra una notificación del sistema si hay permiso (si no, solo el aviso en pantalla). */
export function systemNotify(title: string, body: string): void {
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, icon: `${import.meta.env.BASE_URL}icon-192-v2.png` });
  } catch {
    /* algunos navegadores solo permiten notificar desde el service worker */
  }
}
