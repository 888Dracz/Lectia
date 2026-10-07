// Demostración local de la comunidad, para cuando la app se compila sin
// Supabase. Simula una liga con lectores de ejemplo, algunos amigos con sus
// novedades y una solicitud pendiente. Todo queda en este dispositivo.
import { getKV, setKV } from "../lib/db";
import { hashString, seededRandom, shuffle, uid } from "../lib/util";
import { levelFromXp } from "../store/gamification";
import { CommunityError, type CommunityApi } from "./api";
import { AVATARS, COLORS, GENRES } from "./catalog";
import { DIVISIONS, leagueZones, weekKey, weekStartUtc } from "./divisions";
import { commonStreak, deviceTimeZone, shiftDay, todayInTz } from "./streaks";
import type {
  DaySync,
  Friend,
  FriendRequest,
  League,
  LeagueMember,
  LeagueResult,
  Post,
  PostData,
  PostKind,
  Profile,
  ProfileColor,
  PublicProfile,
  Relation,
  UserSummary,
} from "./types";

const NAMES = [
  "Ana Lucía", "Tomás", "Lucía", "Sofía", "Mateo", "Valentina", "Diego", "Camila", "Joaquín", "Martina",
  "Benjamín", "Isabella", "Samuel", "Renata", "Nicolás", "Emilia", "Gabriel", "Julieta", "Andrés", "Paula",
  "Felipe", "Antonia", "Javier", "Florencia", "Ignacio", "Catalina", "Pedro", "Daniela", "Lucas", "Mariana",
  "Emiliano", "Abril", "Rafael", "Olivia",
];

const BOOKS = [
  ["Cien años de soledad", "Gabriel García Márquez"],
  ["Rayuela", "Julio Cortázar"],
  ["Ficciones", "Jorge Luis Borges"],
  ["La sombra del viento", "Carlos Ruiz Zafón"],
  ["Pedro Páramo", "Juan Rulfo"],
  ["El principito", "Antoine de Saint-Exupéry"],
  ["Don Quijote de la Mancha", "Miguel de Cervantes"],
  ["La casa de los espíritus", "Isabel Allende"],
  ["1984", "George Orwell"],
  ["Dune", "Frank Herbert"],
  ["Orgullo y prejuicio", "Jane Austen"],
  ["El nombre del viento", "Patrick Rothfuss"],
];

const BIOS = [
  "Siempre con un libro en la mochila 🎒",
  "Café, lluvia y una buena novela.",
  "Leo en el metro y antes de dormir.",
  "Coleccionista de subrayados ✍️",
  "Intentando leer 30 libros este año.",
  "Fan de los finales inesperados.",
  "",
];

interface Sample extends UserSummary {
  bio: string;
  genres: string[];
  favorite_book: string;
  favorite_authors: string;
  pace: number;
  /** Días seguidos que leyó hasta ayer. */
  runDays: number;
  /** Hora a la que suele leer: si ya pasó, hoy también leyó. */
  readsAt: number;
}

const SAMPLES: Sample[] = NAMES.map((name, i) => {
  const h = hashString(name);
  const rnd = seededRandom(h);
  const username = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_");
  const book = BOOKS[h % BOOKS.length];
  const runDays = [41, 12, 3, 66, 0, 9][i] ?? Math.floor(rnd() * 25);
  return {
    id: `ejemplo-${username}`,
    username,
    display_name: name,
    avatar: AVATARS[h % AVATARS.length],
    color: COLORS[(h >>> 3) % COLORS.length].id as ProfileColor,
    streak: runDays,
    last_active_day: null,
    tz: deviceTimeZone(),
    level: 1,
    bio: BIOS[h % BIOS.length],
    genres: shuffle(GENRES, rnd)
      .slice(0, 2 + Math.floor(rnd() * 3))
      .map((g) => g.id),
    favorite_book: book[0],
    favorite_authors: BOOKS[(h >>> 5) % BOOKS.length][1],
    pace: 120 + Math.floor(rnd() * 600),
    runDays,
    readsAt: 7 + Math.floor(rnd() * 15),
  };
});

const sampleBy = (key: string) => SAMPLES.find((s) => s.username === key || s.id === key);

interface DemoState {
  session: boolean;
  me: Profile | null;
  posts: Post[];
  liked: string[];
  /** usuario → fecha en que se hicieron amigos */
  friends: Record<string, string>;
  incoming: string[];
  /** usuario → cuándo se envió (en la demo se aceptan solas a los pocos segundos) */
  outgoing: Record<string, string>;
  days: Record<string, DaySync>;
  /** semana → división en la que compitió */
  weeks: Record<string, number>;
}

export interface DemoStorage {
  load(): Promise<DemoState | undefined>;
  save(s: DemoState): Promise<void>;
}

const KV_KEY = "comunidad-demo";
const idbStorage: DemoStorage = {
  load: () => getKV<DemoState>(KV_KEY),
  save: (s) => setKV(KV_KEY, s),
};

const DAY = 86400000;

function initialState(now: Date): DemoState {
  const ago = (d: number) => new Date(now.getTime() - d * DAY).toISOString();
  return {
    session: false,
    me: null,
    posts: [],
    liked: [],
    friends: { ana_lucia: ago(60), tomas: ago(20), lucia: ago(5) },
    incoming: ["sofia"],
    outgoing: {},
    days: {},
    weeks: {},
  };
}

export function createDemoApi(storage: DemoStorage = idbStorage, clock: () => Date = () => new Date()): CommunityApi {
  let state: DemoState | null = null;

  const load = async (): Promise<DemoState> => {
    if (!state) {
      const saved = await storage.load().catch(() => undefined);
      state = saved ? { ...initialState(clock()), ...saved } : initialState(clock());
    }
    // Las solicitudes enviadas se aceptan solas a los 20 segundos.
    for (const [u, at] of Object.entries(state.outgoing)) {
      if (clock().getTime() - Date.parse(at) > 20000) {
        delete state.outgoing[u];
        state.friends[u] = clock().toISOString();
      }
    }
    return state;
  };
  const save = () => (state ? storage.save(state) : Promise.resolve());

  /** Estado con sesión y perfil. `me` se lee después de esperar, para no usar uno viejo. */
  const requireMe = async (): Promise<{ s: DemoState; me: Profile }> => {
    const s = await load();
    if (!s.session) throw new CommunityError("Inicia sesión para usar la comunidad");
    if (!s.me) throw new CommunityError("Primero crea tu perfil");
    return {
      s,
      get me() {
        return s.me!;
      },
    };
  };

  const today = () => todayInTz(deviceTimeZone(), clock());

  /** Días en que leyó una persona de ejemplo. */
  const sampleDays = (p: Sample): string[] => {
    const t = today();
    const out: string[] = [];
    for (let i = 1; i <= p.runDays; i++) out.push(shiftDay(t, -i));
    if (p.runDays > 0 && clock().getHours() >= p.readsAt) out.push(t);
    return out;
  };

  const summary = (p: Sample): UserSummary & { level: number } => {
    const days = sampleDays(p).sort();
    const xp = p.pace * 26 + (hashString(p.username) % 900);
    return {
      id: p.id,
      username: p.username,
      display_name: p.display_name,
      avatar: p.avatar,
      color: p.color,
      streak: days.length,
      last_active_day: days.length ? days[days.length - 1] : null,
      tz: p.tz,
      level: levelFromXp(xp).level,
    };
  };

  const myCountedDays = (s: DemoState) => Object.values(s.days).filter((d) => d.counted).map((d) => d.day);

  const friendStreak = (s: DemoState, p: Sample) =>
    commonStreak(myCountedDays(s), sampleDays(p), today(), shiftDay(s.friends[p.username].slice(0, 10), -1));

  // --- Liga simulada ---------------------------------------------------------

  const weekXpOf = (s: DemoState, week: string) => {
    const end = shiftDay(week, 7);
    return Object.values(s.days)
      .filter((d) => d.day >= week && d.day < end)
      .reduce((a, d) => a + d.xp, 0);
  };

  /** Rivales de un grupo (semana + división) y su XP en el momento `frac` de la semana. */
  const rivals = (week: string, div: number, frac: number): LeagueMember[] => {
    const rnd = seededRandom(hashString(`${week}:${div}`));
    const count = 22 + Math.floor(rnd() * 8);
    return shuffle(SAMPLES, rnd)
      .slice(0, count)
      .map((p) => {
        const target = p.pace * (0.6 + div * 0.15) * (0.5 + rnd());
        const curve = 0.7 + rnd() * 0.6;
        const xp = Math.round(target * Math.pow(Math.max(0, Math.min(1, frac)), curve));
        return { ...summary(p), rank: 0, xp };
      });
  };

  const standings = (s: DemoState, me: Profile, week: string, div: number, frac: number): LeagueMember[] => {
    const mine: LeagueMember = { ...me, rank: 0, xp: weekXpOf(s, week) };
    return [...rivals(week, div, frac), mine]
      .sort((a, b) => b.xp - a.xp || (a.id === me.id ? -1 : b.id === me.id ? 1 : 0))
      .map((m, i) => ({ ...m, rank: i + 1 }));
  };

  const resultOf = (s: DemoState, me: Profile, week: string): LeagueResult | null => {
    const div = s.weeks[week];
    if (div === undefined) return null;
    const table = standings(s, me, week, div, 1);
    const mine = table.find((m) => m.id === me.id)!;
    const z = leagueZones(div, table.length);
    const outcome = mine.rank <= z.promote && mine.xp > 0 ? "promoted" : mine.rank > table.length - z.demote ? "demoted" : "stayed";
    return { week, division: div, rank: mine.rank, size: table.length, xp: mine.xp, outcome };
  };

  const previousResult = (s: DemoState, me: Profile, week: string) => {
    const prev = Object.keys(s.weeks)
      .filter((w) => w < week)
      .sort()
      .pop();
    return prev ? resultOf(s, me, prev) : null;
  };

  const divisionFor = (s: DemoState, me: Profile, week: string) => {
    if (s.weeks[week] !== undefined) return s.weeks[week];
    const prev = previousResult(s, me, week);
    if (!prev) return 0;
    const d = prev.division + (prev.outcome === "promoted" ? 1 : prev.outcome === "demoted" ? -1 : 0);
    return Math.max(0, Math.min(DIVISIONS.length - 1, d));
  };

  const weekFrac = () => (clock().getTime() - weekStartUtc(clock()).getTime()) / (7 * DAY);

  // --- Novedades simuladas ---------------------------------------------------

  const samplePosts = (s: DemoState): Post[] => {
    const midnight = new Date(clock());
    midnight.setHours(0, 0, 0, 0);
    const at = (hours: number) => {
      let t = midnight.getTime() + hours * 3600000;
      if (t > clock().getTime()) t -= DAY;
      return new Date(t).toISOString();
    };
    const templates: [string, PostKind, PostData, number][] = [
      ["ana_lucia", "book_finished", { title: BOOKS[0][0], author: BOOKS[0][1] }, 9.5],
      ["tomas", "streak", { days: 30 }, 8],
      ["lucia", "share_quote", { quote: "Andábamos sin buscarnos pero sabiendo que andábamos para encontrarnos.", title: "Rayuela", author: "Julio Cortázar", note: "La releí tres veces 💛" }, 7],
      ["ana_lucia", "league", { division: 3 }, -2],
      ["tomas", "share_book", { title: "Ficciones", author: "Jorge Luis Borges", rating: 5, text: "Cada cuento es un laberinto. Ideal para leer de a poco." }, -5],
      ["lucia", "achievement", { id: "streak-7", title: "Semana encendida", icon: "🔥" }, -9],
      ["sofia", "share_book", { title: "La sombra del viento", author: "Carlos Ruiz Zafón", rating: 4 }, -11],
      ["ana_lucia", "streak", { days: 50 }, -20],
    ];
    return templates
      .filter(([u]) => s.friends[u])
      .map(([u, kind, data, hours], i) => {
        const p = sampleBy(u)!;
        const id = `ejemplo-post-${i}`;
        const liked = s.liked.includes(id);
        const others = SAMPLES.filter((x) => x.username !== u).slice(i, i + (hashString(id) % 4));
        const likers = [...(liked && s.me ? [s.me] : []), ...others].slice(0, 3);
        return {
          id,
          kind,
          data,
          created_at: at(hours),
          user_id: p.id,
          username: p.username,
          display_name: p.display_name,
          avatar: p.avatar,
          color: p.color,
          likes: others.length + (liked ? 1 : 0),
          liked,
          likers: likers.map((l) => ({ username: l.username, display_name: l.display_name, avatar: l.avatar, color: l.color })),
        };
      });
  };

  /** A tus amigos de ejemplo les gustan tus novedades al rato. */
  const withSampleLikes = (s: DemoState, post: Post): Post => {
    const age = clock().getTime() - Date.parse(post.created_at);
    const fans = Object.keys(s.friends)
      .map((u) => sampleBy(u)!)
      .filter((p, i) => age > 60000 * (i + 1) && hashString(post.id + p.username) % 3 !== 0);
    return {
      ...post,
      likes: fans.length,
      likers: fans.slice(0, 3).map((l) => ({ username: l.username, display_name: l.display_name, avatar: l.avatar, color: l.color })),
    };
  };

  const relationOf = (s: DemoState, username: string): Relation =>
    s.me?.username === username ? "self" : s.friends[username] ? "friends" : s.outgoing[username] ? "pending_out" : s.incoming.includes(username) ? "pending_in" : "none";

  return {
    mode: "demo",

    async getSession() {
      const s = await load();
      return s.session ? { userId: s.me?.id ?? "demo-yo", email: null, anonymous: true } : null;
    },

    async signInAnonymously() {
      const s = await load();
      s.session = true;
      await save();
    },

    async sendEmailCode() {
      throw new CommunityError("En la demostración no hay cuentas con correo: la comunidad todavía no está conectada.");
    },

    async verifyEmailCode() {
      throw new CommunityError("En la demostración no hay cuentas con correo.");
    },

    async signOut() {
      state = initialState(clock());
      await save();
    },

    async deleteAccount() {
      state = initialState(clock());
      await save();
    },

    async getMyProfile() {
      const s = await load();
      return s.session ? s.me : null;
    },

    async saveProfile(input) {
      const s = await load();
      if (!s.session) throw new CommunityError("Inicia sesión para usar la comunidad");
      const username = input.username.trim().toLowerCase();
      if (!/^[a-z0-9_.]{3,20}$/.test(username)) throw new CommunityError("El nombre de usuario debe tener de 3 a 20 letras, números, puntos o guiones bajos");
      if (sampleBy(username)) throw new CommunityError("Ese nombre de usuario ya está ocupado");
      if (!input.display_name.trim()) throw new CommunityError("Escribe tu nombre");
      const created = !s.me;
      s.me = {
        ...(s.me ?? {
          id: "demo-yo",
          total_xp: 0,
          level: 1,
          streak: 0,
          best_streak: 0,
          last_active_day: null,
          books_finished: 0,
          books_this_year: 0,
          minutes_total: 0,
          achievements: [],
          reading_now: null,
          division: 0,
          created_at: clock().toISOString(),
          tz: input.tz || deviceTimeZone(),
        }),
        ...input,
        username,
        display_name: input.display_name.trim().slice(0, 40),
        genres: [...new Set(input.genres)].slice(0, 10),
      };
      if (created) {
        s.posts.push({
          id: uid("demo-post-"),
          kind: "joined",
          data: {},
          created_at: clock().toISOString(),
          user_id: s.me.id,
          username,
          display_name: s.me.display_name,
          avatar: s.me.avatar,
          color: s.me.color,
          likes: 0,
          liked: false,
          likers: [],
        });
      }
      await save();
      return s.me;
    },

    async getProfile(username) {
      const s = await load();
      const key = username.trim().toLowerCase().replace(/^@/, "");
      if (s.me && s.me.username === key) {
        return {
          ...s.me,
          relation: "self",
          friends_count: Object.keys(s.friends).length,
          week_xp: weekXpOf(s, weekKey(clock())),
          friend_streak: 0,
        };
      }
      const p = sampleBy(key);
      if (!p) return null;
      const sum = summary(p);
      const relation = relationOf(s, p.username);
      const total = p.pace * 26 + (hashString(p.username) % 900);
      const book = BOOKS[(hashString(p.username) >>> 2) % BOOKS.length];
      const profile: PublicProfile = {
        ...sum,
        bio: p.bio,
        genres: p.genres,
        favorite_book: p.favorite_book,
        favorite_authors: p.favorite_authors,
        reading_moment: (["manana", "tarde", "noche", "madrugada", ""] as const)[hashString(p.username) % 5],
        yearly_goal: 12 + (hashString(p.username) % 4) * 6,
        total_xp: total,
        level: levelFromXp(total).level,
        best_streak: Math.max(sum.streak, p.runDays + 10),
        books_finished: 3 + (hashString(p.username) % 40),
        books_this_year: 1 + (hashString(p.username) % 14),
        minutes_total: total,
        achievements: ["first-book", "first-session", "hour", "streak-3", "streak-7", "finish-1"].slice(0, 2 + (hashString(p.username) % 5)),
        reading_now: { title: book[0], author: book[1] },
        division: Math.min(DIVISIONS.length - 1, Math.floor(p.pace / 110)),
        created_at: new Date(clock().getTime() - (30 + (hashString(p.username) % 300)) * DAY).toISOString(),
        relation,
        friends_count: 3 + (hashString(p.username) % 20),
        week_xp: Math.round(p.pace * weekFrac()),
        friend_streak: relation === "friends" ? friendStreak(s, p) : 0,
        sample: true,
      };
      return profile;
    },

    async searchUsers(query) {
      await requireMe();
      const q = query.trim().toLowerCase().replace(/^@/, "");
      if (q.length < 2) return [];
      return SAMPLES.filter((p) => p.username.startsWith(q) || p.display_name.toLowerCase().includes(q))
        .slice(0, 20)
        .map(summary);
    },

    async sync(days, stats, feedSince) {
      const { s, me } = await requireMe();
      for (const d of days) {
        const prev = s.days[d.day];
        s.days[d.day] = prev
          ? { day: d.day, xp: Math.max(prev.xp, d.xp), minutes: Math.max(prev.minutes, d.minutes), counted: prev.counted || d.counted }
          : { ...d };
      }
      s.me = { ...me, ...stats };
      const week = weekKey(clock());
      const weekXp = weekXpOf(s, week);
      const division = divisionFor(s, s.me, week);
      if (weekXp > 0 && s.weeks[week] === undefined) s.weeks[week] = division;
      s.me.division = division;
      await save();
      return {
        week,
        week_xp: weekXp,
        division,
        requests: s.incoming.length,
        new_posts: feedSince ? samplePosts(s).filter((p) => p.created_at > feedSince).length : 0,
      };
    },

    async getLeague(): Promise<League> {
      const { s, me } = await requireMe();
      const week = weekKey(clock());
      const joined = s.weeks[week] !== undefined;
      const division = divisionFor(s, me, week);
      const members = joined ? standings(s, me, week, division, weekFrac()) : [];
      const z = leagueZones(division, members.length);
      return {
        week,
        ends_at: new Date(weekStartUtc(clock()).getTime() + 7 * DAY).toISOString(),
        joined,
        division,
        promote: z.promote,
        demote: z.demote,
        members,
        previous: previousResult(s, me, week),
      };
    },

    async getFriends() {
      const { s } = await requireMe();
      const week = weekKey(clock());
      const friends: Friend[] = Object.entries(s.friends)
        .map(([u, since]) => {
          const p = sampleBy(u)!;
          return { ...summary(p), accepted_at: since, week_xp: Math.round(p.pace * weekFrac()), friend_streak: friendStreak(s, p) };
        })
        .sort((a, b) => b.friend_streak - a.friend_streak || b.week_xp - a.week_xp);
      const req = (u: string, at: string): FriendRequest => ({ ...summary(sampleBy(u)!), created_at: at });
      return {
        friends,
        incoming: s.incoming.map((u) => req(u, clock().toISOString())),
        outgoing: Object.entries(s.outgoing).map(([u, at]) => req(u, at)),
        my_week_xp: weekXpOf(s, week),
      };
    },

    async requestFriend(username) {
      const { s, me } = await requireMe();
      const key = username.trim().toLowerCase().replace(/^@/, "");
      if (key === me.username) throw new CommunityError("No puedes agregarte a ti");
      const p = sampleBy(key);
      if (!p) throw new CommunityError("No encontramos a nadie con ese nombre de usuario");
      if (s.friends[key]) return "friends";
      if (s.outgoing[key]) return "pending";
      if (s.incoming.includes(key)) {
        s.incoming = s.incoming.filter((u) => u !== key);
        s.friends[key] = clock().toISOString();
        await save();
        return "accepted";
      }
      s.outgoing[key] = clock().toISOString();
      await save();
      return "sent";
    },

    async respondFriend(userId, accept) {
      const { s } = await requireMe();
      const p = sampleBy(userId);
      if (!p) return;
      s.incoming = s.incoming.filter((u) => u !== p.username);
      if (accept) s.friends[p.username] = clock().toISOString();
      await save();
    },

    async removeFriend(userId) {
      const { s } = await requireMe();
      const p = sampleBy(userId);
      if (!p) return;
      delete s.friends[p.username];
      delete s.outgoing[p.username];
      await save();
    },

    async getFeed(opts = {}) {
      const { s, me } = await requireMe();
      let posts = [...s.posts.map((p) => withSampleLikes(s, p)), ...samplePosts(s)];
      if (opts.userId) {
        const p = sampleBy(opts.userId);
        if (opts.userId !== me.id && !(p && s.friends[p.username])) return [];
        posts = posts.filter((x) => x.user_id === opts.userId);
      }
      return posts
        .filter((p) => !opts.before || p.created_at < opts.before)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, opts.limit ?? 20);
    },

    async createPost(kind, data) {
      const { s, me } = await requireMe();
      s.posts.push({
        id: uid("demo-post-"),
        kind,
        data,
        created_at: clock().toISOString(),
        user_id: me.id,
        username: me.username,
        display_name: me.display_name,
        avatar: me.avatar,
        color: me.color,
        likes: 0,
        liked: false,
        likers: [],
      });
      s.posts = s.posts.slice(-60);
      await save();
    },

    async deletePost(id) {
      const { s } = await requireMe();
      s.posts = s.posts.filter((p) => p.id !== id);
      await save();
    },

    async toggleLike(id) {
      const { s } = await requireMe();
      if (s.posts.some((p) => p.id === id)) throw new CommunityError("No puedes dar me gusta a esta novedad");
      const post = samplePosts(s).find((p) => p.id === id);
      if (!post) throw new CommunityError("No puedes dar me gusta a esta novedad");
      s.liked = s.liked.includes(id) ? s.liked.filter((x) => x !== id) : [...s.liked, id];
      await save();
      const liked = s.liked.includes(id);
      return { liked, likes: post.likes + (liked ? 1 : 0) - (post.liked ? 1 : 0) };
    },
  };
}
