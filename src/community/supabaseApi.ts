// Comunidad sobre Supabase: autenticación (cuenta anónima + correo con
// código) y llamadas a las funciones de supabase/migrations.
import { createClient, type AuthError, type PostgrestError } from "@supabase/supabase-js";
import { CommunityError, SESSION_KEY, type CommunityApi, type EmailPurpose } from "./api";
import type { FriendRequestResult, FriendsData, League, Post, Profile, PublicProfile, SyncResult, UserSummary } from "./types";

const AUTH_MESSAGES: [RegExp, string][] = [
  [/anonymous sign-ins are disabled/i, "La comunidad no tiene activadas las cuentas anónimas (Supabase → Authentication → Sign In / Providers)."],
  [/rate limit|too many|over_email_send_rate_limit|security purposes/i, "Demasiados intentos. Espera unos minutos y vuelve a probar."],
  [/token has expired|invalid.*(otp|token)|otp.*(expired|invalid)/i, "El código no es válido o ya venció. Pide uno nuevo."],
  [/signups not allowed|user not found/i, "No hay ninguna cuenta con ese correo."],
  [/already been registered|already registered|email_exists/i, "Ese correo ya pertenece a otra cuenta. Usa “Entrar con mi correo”."],
  [/invalid.*email|unable to validate email/i, "Ese correo no parece válido."],
];

/** Códigos con los que las funciones del servidor avisan errores en español. */
const SERVER_CODES = new Set(["28000", "P0002", "22023", "23505", "53400", "22001", "42501"]);

function isNetwork(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg) || (typeof navigator !== "undefined" && navigator.onLine === false);
}

function toError(e: AuthError | PostgrestError | Error | unknown): CommunityError {
  if (e instanceof CommunityError) return e;
  if (isNetwork(e)) return new CommunityError("Sin conexión. Revisa tu internet y vuelve a intentarlo.", true);
  const err = e as { message?: string; code?: string };
  const msg = err?.message ?? "Algo salió mal";
  for (const [re, text] of AUTH_MESSAGES) if (re.test(msg) || (err.code && re.test(err.code))) return new CommunityError(text, false, err.code);
  if (/duplicate key/i.test(msg)) return new CommunityError("Ese nombre de usuario ya está ocupado", false, err.code);
  // Los mensajes de las funciones del servidor ya vienen en español.
  if (err.code && SERVER_CODES.has(err.code) && !/^(permission denied|new row|value too long)/i.test(msg)) return new CommunityError(msg, false, err.code);
  if (err.code === "PGRST202" || /could not find the function/i.test(msg))
    return new CommunityError("Falta preparar la base de datos de la comunidad (ver supabase/README).", false, err.code);
  return new CommunityError("No se pudo completar. Inténtalo de nuevo en un rato.", false, err.code);
}

export function createSupabaseApi(url: string, key: string): CommunityApi {
  const client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // La app usa el "#" para navegar: los accesos se hacen con código, no con enlace.
      detectSessionInUrl: false,
      storageKey: SESSION_KEY,
    },
  });

  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    try {
      const { data, error } = await client.rpc(fn, args);
      if (error) throw error;
      return data as T;
    } catch (e) {
      throw toError(e);
    }
  }

  async function auth<T extends { error: AuthError | null }>(run: () => Promise<T>): Promise<T> {
    try {
      const r = await run();
      if (r.error) throw r.error;
      return r;
    } catch (e) {
      throw toError(e);
    }
  }

  return {
    mode: "online",

    async getSession() {
      const { data } = await client.auth.getSession();
      const u = data.session?.user;
      return u ? { userId: u.id, email: u.email || null, anonymous: !!u.is_anonymous } : null;
    },

    async signInAnonymously() {
      await auth(() => client.auth.signInAnonymously());
    },

    async sendEmailCode(email: string, purpose: EmailPurpose) {
      if (purpose === "link") await auth(() => client.auth.updateUser({ email }));
      else await auth(() => client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }));
    },

    async verifyEmailCode(email: string, code: string, purpose: EmailPurpose) {
      await auth(() => client.auth.verifyOtp({ email, token: code.trim(), type: purpose === "link" ? "email_change" : "email" }));
    },

    async signOut() {
      await client.auth.signOut();
    },

    async deleteAccount() {
      await rpc("delete_account");
      await client.auth.signOut({ scope: "local" });
    },

    getMyProfile: () => rpc<Profile | null>("get_my_profile"),
    saveProfile: (p) => rpc<Profile>("save_profile", { p }),
    getProfile: (username, today) => rpc<PublicProfile | null>("get_profile", { p_username: username, p_today: today }),
    searchUsers: (q) => rpc<UserSummary[]>("search_users", { p_query: q }),
    sync: (days, stats, since) => rpc<SyncResult>("sync_progress", { p_days: days, p_stats: stats, p_feed_since: since }),
    getLeague: () => rpc<League>("get_league"),
    getFriends: (today) => rpc<FriendsData>("get_friends", { p_today: today }),
    requestFriend: (username) => rpc<FriendRequestResult>("request_friend", { p_username: username }),
    respondFriend: (userId, accept) => rpc<void>("respond_friend", { p_user: userId, p_accept: accept }),
    removeFriend: (userId) => rpc<void>("remove_friend", { p_user: userId }),
    getFeed: (o = {}) => rpc<Post[]>("get_feed", { p_before: o.before ?? null, p_limit: o.limit ?? 20, p_user: o.userId ?? null }),
    createPost: async (kind, data) => {
      await rpc("create_post", { p_kind: kind, p_data: data });
    },
    deletePost: (id) => rpc<void>("delete_post", { p_post: id }),
    toggleLike: (id) => rpc<{ liked: boolean; likes: number }>("toggle_like", { p_post: id }),
  };
}
