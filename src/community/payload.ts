// Arma lo que se envía al servidor en cada sincronización (función pura).
import { addDays, dayKey } from "../lib/util";
import { dayCounts, lastActiveDay, levelFromXp, streakOf } from "../store/gamification";
import type { PersistedState } from "../store/state";
import { deviceTimeZone } from "./streaks";
import type { DaySync, StatsSync } from "./types";

/** Días hacia atrás que se reenvían (por si hubo días sin conexión). */
export const SYNC_DAYS = 8;

export function buildSyncPayload(state: PersistedState, now = new Date(), tz = deviceTimeZone()): { days: DaySync[]; stats: StatsSync } {
  const { progress } = state;
  const days: DaySync[] = [];
  for (let i = SYNC_DAYS - 1; i >= 0; i--) {
    const key = dayKey(addDays(now, -i));
    const d = progress.days[key];
    if (!d) continue;
    days.push({ day: key, xp: Math.round(d.xp), minutes: Math.floor(d.ms / 60000), counted: dayCounts(d) });
  }
  const streak = streakOf(progress, now);
  const books = Object.values(state.books);
  const year = now.getFullYear();
  const reading = state.community.showReadingNow
    ? books
        .filter((b) => b.status === "reading" && !b.sample)
        .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))[0]
    : undefined;
  const minutes = Object.values(progress.days).reduce((a, d) => a + d.ms, 0) / 60000;
  return {
    days,
    stats: {
      tz,
      total_xp: Math.round(progress.xp),
      level: levelFromXp(progress.xp).level,
      streak: streak.current,
      best_streak: streak.best,
      last_active_day: streak.current > 0 ? lastActiveDay(progress) : null,
      books_finished: progress.booksFinished,
      books_this_year: books.filter((b) => b.status === "finished" && b.finishedAt && new Date(b.finishedAt).getFullYear() === year).length,
      minutes_total: Math.floor(minutes),
      achievements: Object.keys(progress.achievements),
      reading_now: reading ? { title: reading.title.slice(0, 160), author: reading.author.slice(0, 120) } : null,
    },
  };
}
