// Rachas de otras personas (según su zona horaria) y rachas compartidas.
import type { UserSummary } from "./types";

/** Fecha local "AAAA-MM-DD" en una zona horaria (o la del dispositivo si no es válida). */
export function todayInTz(tz: string | undefined, now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return todayInTz(undefined, now);
  }
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Suma días a una fecha "AAAA-MM-DD". */
export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

/**
 * Racha que se ve de otra persona: la guardada sigue viva si su último día
 * activo es hoy o ayer en su zona horaria.
 */
export function liveStreak(u: Pick<UserSummary, "streak" | "last_active_day" | "tz">, now = new Date()): { days: number; today: boolean } {
  if (!u.last_active_day || !u.streak) return { days: 0, today: false };
  const today = todayInTz(u.tz, now);
  if (u.last_active_day >= today) return { days: u.streak, today: true };
  if (u.last_active_day === shiftDay(today, -1)) return { days: u.streak, today: false };
  return { days: 0, today: false };
}

/**
 * Racha compartida (igual que friend_streak() en el servidor): días seguidos
 * en que los dos cumplieron, viva si el último fue hoy o ayer.
 */
export function commonStreak(a: Iterable<string>, b: Iterable<string>, today: string, since?: string): number {
  const setB = new Set(b);
  const common = [...new Set(a)].filter((d) => setB.has(d) && d <= shiftDay(today, 1) && (!since || d >= since)).sort().reverse();
  if (!common.length || common[0] < shiftDay(today, -1)) return 0;
  let n = 1;
  while (n < common.length && common[n] === shiftDay(common[0], -n)) n++;
  return n;
}
