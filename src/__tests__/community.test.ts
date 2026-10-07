import { createDemoApi, type DemoStorage } from "../community/demoApi";
import { division, formatTimeLeft, leagueZones, weekKey, zoneOf, zoneText } from "../community/divisions";
import { buildSyncPayload } from "../community/payload";
import { commonStreak, liveStreak, shiftDay, todayInTz } from "../community/streaks";
import { suggestUsername, USERNAME_RE } from "../community/catalog";
import type { ProfileInput } from "../community/types";
import { addDays, dayKey } from "../lib/util";
import { defaultState, emptyDay } from "../store/state";

describe("divisiones y zonas", () => {
  it("coinciden con las reglas del servidor", () => {
    expect(leagueZones(0, 30)).toEqual({ promote: 10, demote: 0 });
    expect(leagueZones(4, 30)).toEqual({ promote: 7, demote: 5 });
    expect(leagueZones(9, 30)).toEqual({ promote: 0, demote: 5 });
    expect(leagueZones(3, 4)).toEqual({ promote: 1, demote: 0 });
    expect(leagueZones(3, 12)).toEqual({ promote: 4, demote: 2 });
    expect(leagueZones(2, 0)).toEqual({ promote: 0, demote: 0 });
  });

  it("asigna la zona según el puesto", () => {
    expect(zoneOf(1, 30, 2, 50)).toBe("promote");
    expect(zoneOf(1, 30, 2, 0)).toBe("stay");
    expect(zoneOf(15, 30, 2, 50)).toBe("stay");
    expect(zoneOf(28, 30, 2, 50)).toBe("demote");
    expect(zoneOf(28, 30, 0, 50)).toBe("stay");
  });

  it("explica las zonas", () => {
    expect(zoneText(0)).toBe("Los 10 primeros suben a Plata.");
    expect(zoneText(9)).toBe("Los 5 últimos bajan a Obsidiana.");
    expect(division(42).name).toBe("Diamante");
  });

  it("la semana empieza el lunes UTC", () => {
    expect(weekKey(new Date("2026-10-06T12:00:00Z"))).toBe("2026-10-05");
    expect(weekKey(new Date("2026-10-11T23:59:00Z"))).toBe("2026-10-05");
    expect(weekKey(new Date("2026-10-12T00:00:00Z"))).toBe("2026-10-12");
  });

  it("formatea el tiempo restante", () => {
    const now = Date.parse("2026-10-06T10:00:00Z");
    expect(formatTimeLeft(now + (2 * 24 + 5) * 3600000, now)).toBe("2 d 5 h");
    expect(formatTimeLeft(now + 3 * 3600000 + 12 * 60000, now)).toBe("3 h 12 min");
    expect(formatTimeLeft(now + 30000, now)).toBe("1 min");
  });
});

describe("rachas de otras personas", () => {
  const now = new Date("2026-10-06T15:00:00Z");

  it("calcula la fecha local en otra zona horaria", () => {
    expect(todayInTz("UTC", now)).toBe("2026-10-06");
    expect(todayInTz("Pacific/Kiritimati", now)).toBe("2026-10-07");
    expect(todayInTz("Zona/Inventada", now)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("la racha sigue viva si leyó hoy o ayer en su zona", () => {
    expect(liveStreak({ streak: 5, last_active_day: "2026-10-06", tz: "UTC" }, now)).toEqual({ days: 5, today: true });
    expect(liveStreak({ streak: 5, last_active_day: "2026-10-05", tz: "UTC" }, now)).toEqual({ days: 5, today: false });
    expect(liveStreak({ streak: 5, last_active_day: "2026-10-04", tz: "UTC" }, now)).toEqual({ days: 0, today: false });
    // En Kiritimati ya es 7: el 5 fue anteayer.
    expect(liveStreak({ streak: 5, last_active_day: "2026-10-05", tz: "Pacific/Kiritimati" }, now).days).toBe(0);
  });

  it("racha compartida (igual que en el servidor)", () => {
    const t = "2026-10-06";
    const a = ["2026-10-01", "2026-10-04", "2026-10-05", "2026-10-06"];
    const b = ["2026-10-01", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-03"];
    expect(commonStreak(a, b, t)).toBe(3);
    expect(commonStreak(a, b, "2026-10-07")).toBe(3);
    expect(commonStreak(a, b, "2026-10-08")).toBe(0);
    expect(commonStreak(a, b, t, "2026-10-05")).toBe(2);
    expect(commonStreak(a, ["2026-10-06", "2026-10-04"], t)).toBe(1);
    expect(commonStreak([], b, t)).toBe(0);
  });
});

describe("perfil", () => {
  it("propone nombres de usuario válidos", () => {
    expect(suggestUsername("María José Peña")).toBe("maria_jose_pena");
    expect(USERNAME_RE.test(suggestUsername("Al"))).toBe(true);
    expect(USERNAME_RE.test(suggestUsername("¡¡!!"))).toBe(true);
  });
});

describe("datos que se sincronizan", () => {
  it("envía los últimos días y las estadísticas", () => {
    const now = new Date(2026, 9, 6, 12);
    const s = defaultState();
    s.progress.xp = 450;
    s.progress.booksFinished = 3;
    s.progress.achievements = { "first-book": 1, hour: 2 };
    s.progress.days[dayKey(now)] = { ...emptyDay(), ms: 25 * 60000, xp: 60 };
    s.progress.days[dayKey(addDays(now, -1))] = { ...emptyDay(), ms: 5 * 60000, xp: 10 };
    s.progress.days[dayKey(addDays(now, -20))] = { ...emptyDay(), ms: 5 * 60000, xp: 10 };
    s.books.b1 = {
      id: "b1", title: "Rayuela", author: "Cortázar", format: "epub", fileName: "r.epub", fileSize: 1, hasCover: false,
      addedAt: 1, lastOpenedAt: 5, status: "reading", favorite: false, collections: [], readingMs: 0,
    };
    s.books.b2 = { ...s.books.b1, id: "b2", title: "Ficciones", status: "finished", finishedAt: now.getTime() };
    const { days, stats } = buildSyncPayload(s, now, "America/Lima");
    expect(days).toEqual([
      { day: dayKey(addDays(now, -1)), xp: 10, minutes: 5, counted: true },
      { day: dayKey(now), xp: 60, minutes: 25, counted: true },
    ]);
    expect(stats).toMatchObject({
      tz: "America/Lima",
      total_xp: 450,
      level: 3,
      streak: 2,
      last_active_day: dayKey(now),
      books_finished: 3,
      books_this_year: 1,
      minutes_total: 35,
      achievements: ["first-book", "hour"],
      reading_now: { title: "Rayuela", author: "Cortázar" },
    });
    s.community.showReadingNow = false;
    expect(buildSyncPayload(s, now).stats.reading_now).toBeNull();
  });
});

describe("demostración de la comunidad", () => {
  const memory = (): DemoStorage => {
    let saved: unknown;
    return { load: async () => saved as never, save: async (s) => void (saved = structuredClone(s)) };
  };
  const input: ProfileInput = {
    username: "yo_leo",
    display_name: "Yo",
    avatar: "🦊",
    color: "rose",
    bio: "",
    genres: ["Fantasía", "Fantasía", "Poesía"],
    favorite_book: "",
    favorite_authors: "",
    reading_moment: "noche",
    yearly_goal: 12,
  };

  it("crea el perfil, entra a la liga y maneja amigos y me gusta", async () => {
    let now = new Date("2026-10-07T18:00:00Z");
    const api = createDemoApi(memory(), () => now);
    await expect(api.getLeague()).rejects.toThrow("Inicia sesión");
    await api.signInAnonymously();
    await expect(api.getLeague()).rejects.toThrow("Primero crea tu perfil");
    await expect(api.saveProfile({ ...input, username: "tomas" })).rejects.toThrow("ocupado");
    const me = await api.saveProfile(input);
    expect(me.genres).toEqual(["Fantasía", "Poesía"]);

    let league = await api.getLeague();
    expect(league.joined).toBe(false);
    const today = todayInTz(undefined, now);
    const r = await api.sync([{ day: today, xp: 80, minutes: 30, counted: true }], buildSyncPayload(defaultState(), now).stats, null);
    expect(r).toMatchObject({ week_xp: 80, division: 0, requests: 1 });
    league = await api.getLeague();
    expect(league.joined).toBe(true);
    expect(league.members.some((m) => m.username === "yo_leo" && m.xp === 80)).toBe(true);
    expect(league.members.map((m) => m.rank)).toEqual(league.members.map((_, i) => i + 1));

    // Amigos: aceptar la solicitud de Sofía, enviar otra y que se acepte sola.
    let friends = await api.getFriends(today);
    expect(friends.incoming[0].username).toBe("sofia");
    await api.respondFriend(friends.incoming[0].id, true);
    expect(await api.requestFriend("@mateo")).toBe("sent");
    expect(await api.requestFriend("mateo")).toBe("pending");
    now = new Date(now.getTime() + 30000);
    friends = await api.getFriends(today);
    expect(friends.friends.map((f) => f.username)).toEqual(expect.arrayContaining(["sofia", "mateo", "ana_lucia"]));
    expect((await api.getProfile("mateo", today))?.relation).toBe("friends");

    // Novedades y me gusta.
    await api.createPost("share_book", { title: "Rayuela", rating: 5 });
    const feed = await api.getFeed();
    const mine = feed.find((p) => p.kind === "share_book" && p.username === "yo_leo")!;
    await expect(api.toggleLike(mine.id)).rejects.toThrow("No puedes");
    const other = feed.find((p) => p.username !== "yo_leo")!;
    const liked = await api.toggleLike(other.id);
    expect(liked.liked).toBe(true);
    expect((await api.toggleLike(other.id)).liked).toBe(false);
    expect(await api.getFeed({ userId: "ejemplo-camila" })).toEqual([]);

    await api.removeFriend("ejemplo-mateo");
    expect((await api.getProfile("mateo", today))?.relation).toBe("none");
  });

  it("al terminar la semana, el primer puesto sube de división", async () => {
    let now = new Date("2026-10-07T18:00:00Z");
    const api = createDemoApi(memory(), () => now);
    await api.signInAnonymously();
    await api.saveProfile(input);
    const stats = buildSyncPayload(defaultState(), now).stats;
    await api.sync([{ day: "2026-10-07", xp: 5000, minutes: 300, counted: true }], stats, null);
    now = new Date("2026-10-13T10:00:00Z");
    const league = await api.getLeague();
    expect(league.previous).toMatchObject({ week: "2026-10-05", division: 0, rank: 1, outcome: "promoted" });
    expect(league.division).toBe(1);
    expect(league.joined).toBe(false);
  });
});

describe("rutas de la comunidad", () => {
  it("van y vuelven del # de la dirección", async () => {
    const { parseHash, routeToHash } = await import("../lib/router");
    expect(parseHash("#/comunidad")).toEqual({ name: "community", tab: "league" });
    expect(parseHash("#/comunidad/amigos")).toEqual({ name: "community", tab: "friends" });
    expect(parseHash("#/comunidad/novedades")).toEqual({ name: "community", tab: "feed" });
    expect(parseHash("#/comunidad/otra")).toEqual({ name: "community", tab: "league" });
    expect(parseHash("#/perfil")).toEqual({ name: "profile" });
    expect(parseHash("#/perfil/Ana_Lee")).toEqual({ name: "profile", username: "ana_lee" });
    expect(routeToHash({ name: "community", tab: "feed" })).toBe("#/comunidad/novedades");
    expect(routeToHash({ name: "community", tab: "league" })).toBe("#/comunidad");
    expect(routeToHash({ name: "profile", username: "ana" })).toBe("#/perfil/ana");
  });
});
