import { computeStreak, dailyQuests, levelFromXp, xpForLevel } from "../store/gamification";
import { emptyDay, type DayStats } from "../store/state";
import { addDays, dayKey } from "../lib/util";

const day = (ms: number): DayStats => ({ ...emptyDay(), ms });

describe("niveles", () => {
  it("la XP necesaria crece con cada nivel", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
  });

  it("calcula nivel, progreso y rango", () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(99).level).toBe(1);
    const l = levelFromXp(150);
    expect(l.level).toBe(2);
    expect(l.xpIntoLevel).toBe(50);
    expect(l.xpForNext).toBe(200);
    expect(l.progress).toBeCloseTo(0.25);
    expect(levelFromXp(xpForLevel(10)).rank.name).toBe("Farol");
  });
});

describe("rachas", () => {
  const today = new Date(2026, 9, 6, 12);
  const k = (n: number) => dayKey(addDays(today, -n));

  it("cuenta días seguidos incluyendo hoy", () => {
    const days = { [k(0)]: day(120000), [k(1)]: day(70000), [k(2)]: day(600000), [k(4)]: day(600000) };
    const s = computeStreak(days, today);
    expect(s.current).toBe(3);
    expect(s.todayDone).toBe(true);
    expect(s.best).toBe(3);
  });

  it("si hoy aún no se leyó, la racha sigue viva desde ayer", () => {
    const days = { [k(1)]: day(70000), [k(2)]: day(70000) };
    expect(computeStreak(days, today).current).toBe(2);
  });

  it("menos de un minuto no cuenta", () => {
    const days = { [k(0)]: day(30000) };
    expect(computeStreak(days, today).current).toBe(0);
  });

  it("la mejor racha histórica se conserva", () => {
    const days: Record<string, DayStats> = {};
    for (let i = 10; i < 17; i++) days[k(i)] = day(90000);
    expect(computeStreak(days, today)).toMatchObject({ current: 0, best: 7 });
  });
});

describe("retos diarios", () => {
  it("usa la meta diaria configurada", () => {
    const q = dailyQuests({ ...emptyDay(), ms: 10 * 60000, games: 1 }, 15);
    expect(q[0]).toMatchObject({ id: "read", progress: 10, target: 15 });
    expect(q[1]).toMatchObject({ id: "games", progress: 1, target: 2 });
  });
});
