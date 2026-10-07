import { applyFreezes, computeStreak, dailyQuests, earnsFreeze, lastActiveDay, levelFromXp, xpForLevel } from "../store/gamification";
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

describe("protectores de racha", () => {
  const today = new Date(2026, 9, 6, 12);
  const k = (n: number) => dayKey(addDays(today, -n));

  it("un día protegido no suma pero tampoco corta la racha", () => {
    const days = { [k(0)]: day(120000), [k(2)]: day(120000), [k(3)]: day(120000) };
    expect(computeStreak(days, today).current).toBe(1);
    expect(computeStreak(days, today, [k(1)])).toMatchObject({ current: 3, best: 3 });
  });

  it("usa protectores si faltó un día y alcanzan", () => {
    const days = { [k(2)]: day(120000), [k(3)]: day(120000) };
    const r = applyFreezes(days, [], 1, today);
    expect(r).toEqual({ frozen: [k(1)], freezes: 0, used: [k(1)] });
    expect(computeStreak(days, today, r.frozen).current).toBe(2);
  });

  it("no gasta protectores si la racha ya se perdió o no faltó nada", () => {
    const days = { [k(3)]: day(120000) };
    expect(applyFreezes(days, [], 1, today).used).toEqual([]);
    expect(applyFreezes(days, [], 2, today).used).toEqual([k(1), k(2)].sort());
    expect(applyFreezes({ [k(1)]: day(120000) }, [], 2, today).used).toEqual([]);
    expect(applyFreezes({}, [], 2, today).used).toEqual([]);
  });

  it("se gana uno cada 7 días, hasta 2", () => {
    expect(earnsFreeze(7, 0)).toBe(true);
    expect(earnsFreeze(14, 1)).toBe(true);
    expect(earnsFreeze(14, 2)).toBe(false);
    expect(earnsFreeze(8, 0)).toBe(false);
  });

  it("el último día activo incluye los protegidos", () => {
    const progress = { days: { [k(3)]: day(120000), [k(9)]: day(1000) }, frozenDays: [k(2)] };
    expect(lastActiveDay(progress)).toBe(k(2));
    expect(lastActiveDay({ days: {}, frozenDays: [] })).toBeNull();
  });
});
