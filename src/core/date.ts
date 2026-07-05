import type { IsoDate } from "./types";

// ---------------------------------------------------------------------------
// Utilidades de fecha. Trabajamos siempre con `YYYY-MM-DD` en UTC para evitar
// que la zona horaria del dispositivo desplace el "día del ciclo".
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Convierte una fecha ISO `YYYY-MM-DD` a milisegundos UTC de medianoche. */
function toUtcMs(iso: IsoDate): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Formatea un `Date` (o ms) como `YYYY-MM-DD` en UTC. */
export function toIsoDate(value: Date | number): IsoDate {
  const d = typeof value === "number" ? new Date(value) : value;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Fecha de hoy en formato ISO, según la zona local del dispositivo. */
export function todayIso(now: Date = new Date()): IsoDate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Diferencia en días completos entre dos fechas ISO (b - a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / MS_PER_DAY);
}

/** Devuelve la fecha ISO resultante de sumar `days` a `iso` (puede ser negativo). */
export function addDays(iso: IsoDate, days: number): IsoDate {
  return toIsoDate(toUtcMs(iso) + days * MS_PER_DAY);
}

/** Compara dos fechas ISO. Devuelve <0, 0 o >0. */
export function compareIso(a: IsoDate, b: IsoDate): number {
  return toUtcMs(a) - toUtcMs(b);
}

/** Valida que una cadena tenga la forma `YYYY-MM-DD` y sea una fecha real. */
export function isValidIsoDate(value: string): value is IsoDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}
