// Estado de la comunidad: sesión, perfil, liga, amigos y novedades. Se
// sincroniza con el servidor cuando cambia el progreso de lectura.
import { create } from "zustand";
import type { BookMeta } from "../books/types";
import { getKV, setKV } from "../lib/db";
import { dayKey, uid } from "../lib/util";
import { onStoreEvent, type StoreEvent } from "../store/events";
import { ACHIEVEMENTS, RANKS, STREAK_MILESTONES } from "../store/gamification";
import { getPersisted, useStore } from "../store/store";
import { toast, useUi } from "../store/ui";
import { CommunityError, getApi, mightHaveSession, supabaseConfig, type EmailPurpose } from "./api";
import { division } from "./divisions";
import { buildSyncPayload } from "./payload";
import { deviceTimeZone, shiftDay } from "./streaks";
import { coverThumb } from "./thumb";
import type {
  FriendRequestResult,
  FriendsData,
  League,
  Post,
  PostData,
  PostKind,
  Profile,
  ProfileInput,
  Session,
} from "./types";

interface CommunityState {
  status: "idle" | "loading" | "ready";
  mode: "online" | "demo" | null;
  session: Session | null;
  profile: Profile | null;
  league: League | null;
  friends: FriendsData | null;
  feed: Post[] | null;
  feedDone: boolean;
  badges: { requests: number; posts: number };
  offline: boolean;
  lastSyncAt: number;
  /** Polvo de hadas de esta semana en la liga. */
  weekXp: number;
}

const initial: CommunityState = {
  status: "idle",
  mode: null,
  session: null,
  profile: null,
  league: null,
  friends: null,
  feed: null,
  feedDone: false,
  badges: { requests: 0, posts: 0 },
  offline: false,
  lastSyncAt: 0,
  weekXp: 0,
};

export const useCommunity = create<CommunityState>(() => initial);

const set = (patch: Partial<CommunityState>) => useCommunity.setState(patch);
const get = () => useCommunity.getState();

const PROFILE_CACHE = "comunidad-perfil";

const today = () => dayKey();

function cacheProfile(p: Profile | null) {
  void setKV(PROFILE_CACHE, p).catch(() => undefined);
}

/** Muestra el error como aviso; devuelve si fue por falta de conexión. */
export function reportError(e: unknown, fallback = "No se pudo completar"): boolean {
  const offline = e instanceof CommunityError && e.offline;
  if (offline) set({ offline: true });
  toast(e instanceof Error ? e.message : fallback, { tone: "error" }, 4500);
  return offline;
}

// --- Sesión y perfil ---------------------------------------------------------

/** @usuario de un enlace de invitación abierto antes de tener perfil. */
let pendingInvite: string | null = null;

export function setPendingInvite(username: string | null) {
  pendingInvite = username;
}

/** Devuelve (y olvida) la invitación pendiente. */
export function takePendingInvite(): string | null {
  const u = pendingInvite;
  pendingInvite = null;
  return u;
}

let initPromise: Promise<void> | null = null;

export function initCommunity(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      set({ status: "loading" });
      // Sin sesión guardada no hace falta cargar el cliente del servidor todavía.
      if (!mightHaveSession()) {
        cacheProfile(null);
        set({ status: "ready", mode: supabaseConfig() ? "online" : "demo", session: null, profile: null });
        return;
      }
      const api = await getApi();
      set({ mode: api.mode });
      const cached = await getKV<Profile | null>(PROFILE_CACHE).catch(() => null);
      const session = await api.getSession().catch(() => null);
      if (!session) {
        cacheProfile(null);
        set({ status: "ready", session: null, profile: null });
        return;
      }
      set({ session, profile: cached && cached.id === session.userId ? cached : null });
      try {
        const profile = await api.getMyProfile();
        set({ profile, offline: false });
        cacheProfile(profile);
      } catch (e) {
        if (!(e instanceof CommunityError && e.offline)) console.warn(e);
        set({ offline: e instanceof CommunityError && e.offline });
      }
      set({ status: "ready" });
      if (get().profile) void syncNow();
    })().catch((e) => {
      console.error(e);
      set({ status: "ready" });
    });
  }
  return initPromise;
}

async function refreshSession() {
  const api = await getApi();
  set({ session: await api.getSession() });
}

/** Crea la cuenta (anónima) si hace falta y guarda el perfil. */
export async function saveProfile(input: ProfileInput): Promise<Profile> {
  const api = await getApi();
  const isNew = !get().profile;
  if (!get().session) {
    await api.signInAnonymously();
    await refreshSession();
  }
  const profile = await api.saveProfile({ ...input, tz: deviceTimeZone() });
  set({ profile, offline: false });
  cacheProfile(profile);
  if (isNew) {
    useStore.getState().setCommunity({ feedSeenAt: new Date().toISOString() });
    await syncNow();
  }
  return profile;
}

export async function sendEmailCode(email: string, purpose: EmailPurpose) {
  const api = await getApi();
  await api.sendEmailCode(email.trim(), purpose);
}

/** Confirma el código: vincula el correo o entra a la cuenta de ese correo. */
export async function verifyEmailCode(email: string, code: string, purpose: EmailPurpose) {
  const api = await getApi();
  await api.verifyEmailCode(email.trim(), code, purpose);
  await refreshSession();
  if (purpose === "login") {
    resetData();
    const profile = await api.getMyProfile();
    set({ profile });
    cacheProfile(profile);
    if (profile) void syncNow();
  }
}

/** Olvida lo de la cuenta anterior (también lo pendiente de publicar). */
function resetData() {
  set({ league: null, friends: null, feed: null, feedDone: false, badges: { requests: 0, posts: 0 }, weekXp: 0 });
  useStore.getState().setCommunity({ outbox: [], seenLeagueWeek: undefined, feedSeenAt: undefined });
}

export async function signOut() {
  const api = await getApi();
  await api.signOut();
  resetData();
  set({ session: null, profile: null });
  cacheProfile(null);
}

export async function deleteAccount() {
  const api = await getApi();
  await api.deleteAccount();
  resetData();
  set({ session: null, profile: null });
  cacheProfile(null);
}

// --- Sincronización ----------------------------------------------------------

let syncing: Promise<void> | null = null;
let syncTimer: ReturnType<typeof setTimeout> | undefined;

/** Envía el progreso y trae avisos (solicitudes, novedades nuevas). */
export function syncNow(): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    const profile = get().profile;
    if (!profile) return;
    const api = await getApi();
    const state = getPersisted();
    const { days, stats } = buildSyncPayload(state);
    try {
      const r = await api.sync(days, stats, state.community.feedSeenAt ?? null);
      const next = { ...profile, ...stats, division: r.division };
      set({ badges: { requests: r.requests, posts: r.new_posts }, offline: false, lastSyncAt: Date.now(), profile: next, weekXp: r.week_xp });
      cacheProfile(next);
      await flushOutbox();
      if (r.week !== useStore.getState().community.seenLeagueWeek) await refreshLeague();
    } catch (e) {
      set({ offline: e instanceof CommunityError && e.offline });
      if (!(e instanceof CommunityError && e.offline)) console.warn("No se pudo sincronizar", e);
    }
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

let syncDueAt = 0;

/** Programa una sincronización (si ya hay una antes, se mantiene esa). */
export function scheduleSync(ms = 30000) {
  if (!get().profile) return;
  const due = Date.now() + ms;
  if (syncTimer && syncDueAt <= due) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncDueAt = due;
  syncTimer = setTimeout(() => {
    syncTimer = undefined;
    void syncNow();
  }, ms);
}

// --- Liga --------------------------------------------------------------------

export async function refreshLeague(): Promise<void> {
  const api = await getApi();
  const league = await api.getLeague();
  set({ league });
  const c = useStore.getState().community;
  if (c.seenLeagueWeek === league.week) return;
  const prev = league.previous;
  // Solo se celebra la semana que acaba de terminar (y si ya se había visto otra).
  if (c.seenLeagueWeek && prev && prev.week === shiftDay(league.week, -7)) {
    const from = division(prev.division);
    if (prev.outcome === "promoted") {
      const to = division(prev.division + 1);
      useUi.getState().celebrate({
        kind: "league",
        title: `¡Subiste a ${to.name}!`,
        subtitle: `Terminaste en el puesto ${prev.rank} de ${prev.size} en la división ${from.name}.`,
        icon: "🏆",
      });
      if (c.autoShareMilestones) queuePost("league", { division: to.id });
    } else if (prev.outcome === "demoted") {
      toast(`Bajaste a ${division(prev.division - 1).name}. ¡Esta semana puedes recuperarte!`, { icon: "🛡️" }, 6000);
    } else {
      toast(`Terminaste ${prev.rank}º de ${prev.size}: sigues en ${from.name}.`, { icon: "🏅" }, 5000);
    }
  }
  useStore.getState().setCommunity({ seenLeagueWeek: league.week });
}

// --- Amigos ------------------------------------------------------------------

export async function refreshFriends(): Promise<void> {
  const api = await getApi();
  const friends = await api.getFriends(today());
  set({ friends, badges: { ...get().badges, requests: friends.incoming.length } });
}

export async function requestFriend(username: string): Promise<FriendRequestResult> {
  const api = await getApi();
  const r = await api.requestFriend(username);
  void refreshFriends().catch(() => undefined);
  return r;
}

export async function respondFriend(userId: string, accept: boolean) {
  const api = await getApi();
  await api.respondFriend(userId, accept);
  await refreshFriends();
  if (accept && get().feed) void refreshFeed();
}

export async function removeFriend(userId: string) {
  const api = await getApi();
  await api.removeFriend(userId);
  await refreshFriends();
  if (get().feed) void refreshFeed();
}

// --- Novedades ---------------------------------------------------------------

const PAGE = 20;

export async function refreshFeed(more = false): Promise<void> {
  const api = await getApi();
  const current = get().feed ?? [];
  const before = more && current.length ? current[current.length - 1].created_at : undefined;
  const page = await api.getFeed({ before, limit: PAGE });
  set({ feed: more ? [...current, ...page] : page, feedDone: page.length < PAGE });
}

/** Marca las novedades como vistas (apaga el aviso de la pestaña). */
export function markFeedSeen() {
  useStore.getState().setCommunity({ feedSeenAt: new Date().toISOString() });
  set({ badges: { ...get().badges, posts: 0 } });
}

/** Da o quita "me gusta" y actualiza la lista de novedades. */
export async function toggleLike(post: Post): Promise<{ liked: boolean; likes: number }> {
  const api = await getApi();
  const r = await api.toggleLike(post.id);
  set({ feed: (get().feed ?? []).map((x) => (x.id === post.id ? { ...x, ...r } : x)) });
  return r;
}

export async function deletePost(id: string) {
  const api = await getApi();
  await api.deletePost(id);
  set({ feed: (get().feed ?? []).filter((p) => p.id !== id) });
}

/** Deja una novedad lista para publicar (se reintenta si no hay conexión). */
export function queuePost(kind: PostKind, data: PostData) {
  useStore.getState().setCommunity((c) => ({ outbox: [...c.outbox, { id: uid("np"), kind, data, createdAt: Date.now() }].slice(-20) }));
  void flushOutbox();
}

let flushing = false;

async function flushOutbox() {
  if (flushing || !get().profile) return;
  flushing = true;
  let published = 0;
  try {
    const api = await getApi();
    for (const item of [...useStore.getState().community.outbox]) {
      try {
        await api.createPost(item.kind, item.data);
        published++;
      } catch (e) {
        if (e instanceof CommunityError && e.offline) break;
        console.warn("Novedad descartada", e);
      }
      useStore.getState().setCommunity((c) => ({ outbox: c.outbox.filter((x) => x.id !== item.id) }));
    }
  } finally {
    flushing = false;
  }
  if (published && get().feed) void refreshFeed().catch(() => undefined);
}

export async function bookPostData(book: BookMeta, extra: PostData = {}): Promise<PostData> {
  const cover = book.hasCover ? await coverThumb(book.id) : undefined;
  return { title: book.title.slice(0, 200), author: book.author.slice(0, 160), ...(cover ? { cover } : {}), ...extra };
}

// --- Publicaciones automáticas -------------------------------------------------

async function onEvent(e: StoreEvent) {
  if (!get().profile) return;
  const c = useStore.getState().community;
  switch (e.type) {
    case "book-finished": {
      const book = useStore.getState().books[e.bookId];
      if (c.autoShareBooks && book && !book.sample) queuePost("book_finished", await bookPostData(book));
      break;
    }
    case "achievement": {
      const a = ACHIEVEMENTS.find((x) => x.id === e.id);
      if (c.autoShareMilestones && a) queuePost("achievement", { id: a.id, title: a.title, icon: a.icon });
      break;
    }
    case "level": {
      const rank = RANKS.find((r) => r.from === e.level);
      if (c.autoShareMilestones && rank && e.level > 1) queuePost("level", { level: e.level, rank: rank.name, emoji: rank.emoji });
      break;
    }
    case "streak-day":
      if (c.autoShareMilestones && STREAK_MILESTONES.includes(e.streak)) queuePost("streak", { days: e.streak });
      break;
  }
  // Rachas y logros se ven antes en la comunidad.
  scheduleSync(1500);
}

let setupDone = false;

/** Arranca la comunidad (después de cargar el estado de la app). */
export function setupCommunity() {
  if (setupDone) return;
  setupDone = true;
  void initCommunity();
  onStoreEvent((e) => void onEvent(e));
  useStore.subscribe((s, prev) => {
    if (s.progress !== prev.progress || s.community.showReadingNow !== prev.community.showReadingNow) scheduleSync();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - get().lastSyncAt > 60000) scheduleSync(800);
  });
  window.addEventListener("online", () => scheduleSync(1000));
}
