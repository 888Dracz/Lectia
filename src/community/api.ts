// Acceso a la comunidad. Con Supabase configurado (VITE_SUPABASE_URL y
// VITE_SUPABASE_ANON_KEY al compilar) se usa el servidor real; si no, una
// demostración local con lectores de ejemplo.
import type {
  DaySync,
  FriendRequestResult,
  FriendsData,
  League,
  Post,
  PostData,
  PostKind,
  Profile,
  ProfileInput,
  PublicProfile,
  Session,
  StatsSync,
  SyncResult,
  UserSummary,
} from "./types";

export type EmailPurpose = "link" | "login";

export interface CommunityApi {
  mode: "online" | "demo";
  getSession(): Promise<Session | null>;
  /** Crea una cuenta anónima (se puede proteger después con un correo). */
  signInAnonymously(): Promise<void>;
  /** Envía un código al correo: para vincularlo a esta cuenta o para entrar a otra. */
  sendEmailCode(email: string, purpose: EmailPurpose): Promise<void>;
  verifyEmailCode(email: string, code: string, purpose: EmailPurpose): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;

  getMyProfile(): Promise<Profile | null>;
  saveProfile(input: ProfileInput): Promise<Profile>;
  getProfile(username: string, today: string): Promise<PublicProfile | null>;
  searchUsers(query: string): Promise<UserSummary[]>;

  sync(days: DaySync[], stats: StatsSync, feedSince: string | null): Promise<SyncResult>;
  getLeague(): Promise<League>;

  getFriends(today: string): Promise<FriendsData>;
  requestFriend(username: string): Promise<FriendRequestResult>;
  respondFriend(userId: string, accept: boolean): Promise<void>;
  removeFriend(userId: string): Promise<void>;

  getFeed(opts?: { before?: string; userId?: string; limit?: number }): Promise<Post[]>;
  createPost(kind: PostKind, data: PostData): Promise<void>;
  deletePost(id: string): Promise<void>;
  toggleLike(id: string): Promise<{ liked: boolean; likes: number }>;
}

/** Error con un mensaje listo para mostrar. `offline` si fue por la conexión. */
export class CommunityError extends Error {
  constructor(
    message: string,
    readonly offline = false,
    readonly code?: string
  ) {
    super(message);
  }
}

export function supabaseConfig(): { url: string; key: string } | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = (env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim();
  return url && key ? { url, key } : null;
}

/** Clave donde el cliente de Supabase guarda la sesión. */
export const SESSION_KEY = "lectia-comunidad";

/** Si puede haber una sesión iniciada (para no cargar el cliente sin necesidad). */
export function mightHaveSession(): boolean {
  if (!supabaseConfig()) return true;
  try {
    return localStorage.getItem(SESSION_KEY) !== null;
  } catch {
    return true;
  }
}

let apiPromise: Promise<CommunityApi> | null = null;

export function getApi(): Promise<CommunityApi> {
  if (!apiPromise) {
    const cfg = supabaseConfig();
    apiPromise = cfg
      ? import("./supabaseApi").then((m) => m.createSupabaseApi(cfg.url, cfg.key))
      : import("./demoApi").then((m) => m.createDemoApi());
  }
  return apiPromise;
}
