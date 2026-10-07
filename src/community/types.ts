// Tipos de la comunidad (mismos nombres de campos que devuelve el servidor).

export type ProfileColor = "gold" | "violet" | "rose" | "teal" | "blue" | "green" | "orange" | "red";
export type ReadingMoment = "" | "manana" | "tarde" | "noche" | "madrugada";

/** Lo que cada persona escribe en su perfil. */
export interface ProfileInput {
  username: string;
  display_name: string;
  avatar: string;
  color: ProfileColor;
  bio: string;
  genres: string[];
  favorite_book: string;
  favorite_authors: string;
  reading_moment: ReadingMoment;
  yearly_goal: number;
  tz?: string;
}

/** Datos mínimos para mostrar a alguien en listas. */
export interface UserSummary {
  id: string;
  username: string;
  display_name: string;
  avatar: string;
  color: ProfileColor;
  streak: number;
  last_active_day: string | null;
  tz: string;
  level?: number;
}

export interface Profile extends ProfileInput, UserSummary {
  tz: string;
  total_xp: number;
  level: number;
  best_streak: number;
  books_finished: number;
  books_this_year: number;
  minutes_total: number;
  achievements: string[];
  reading_now: { title: string; author: string } | null;
  division: number;
  created_at: string;
}

export type Relation = "self" | "friends" | "pending_out" | "pending_in" | "none";

export interface PublicProfile extends Profile {
  relation: Relation;
  friends_count: number;
  week_xp: number;
  friend_streak: number;
  /** Solo en el modo de demostración. */
  sample?: boolean;
}

export interface LeagueMember extends UserSummary {
  rank: number;
  xp: number;
}

export interface LeagueResult {
  week: string;
  division: number;
  rank: number;
  size: number;
  xp: number;
  outcome: "promoted" | "demoted" | "stayed";
}

export interface League {
  week: string;
  ends_at: string;
  joined: boolean;
  division: number;
  promote: number;
  demote: number;
  members: LeagueMember[];
  previous: LeagueResult | null;
}

export interface Friend extends UserSummary {
  level: number;
  accepted_at: string;
  week_xp: number;
  friend_streak: number;
}

export interface FriendRequest extends UserSummary {
  created_at: string;
}

export interface FriendsData {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  my_week_xp: number;
}

export type PostKind =
  | "joined"
  | "book_finished"
  | "share_book"
  | "share_quote"
  | "streak"
  | "achievement"
  | "level"
  | "league";

export interface PostData {
  title?: string;
  author?: string;
  cover?: string;
  rating?: number;
  text?: string;
  quote?: string;
  note?: string;
  days?: number;
  id?: string;
  icon?: string;
  level?: number;
  rank?: string;
  emoji?: string;
  division?: number;
}

export interface Liker {
  username: string;
  display_name: string;
  avatar: string;
  color: ProfileColor;
}

export interface Post {
  id: string;
  kind: PostKind;
  data: PostData;
  created_at: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar: string;
  color: ProfileColor;
  likes: number;
  liked: boolean;
  likers: Liker[];
}

export interface DaySync {
  day: string;
  xp: number;
  minutes: number;
  counted: boolean;
}

export interface StatsSync {
  tz: string;
  total_xp: number;
  level: number;
  streak: number;
  best_streak: number;
  last_active_day: string | null;
  books_finished: number;
  books_this_year: number;
  minutes_total: number;
  achievements: string[];
  reading_now: { title: string; author: string } | null;
}

export interface SyncResult {
  week: string;
  week_xp: number;
  division: number;
  requests: number;
  new_posts: number;
}

export interface Session {
  userId: string;
  email: string | null;
  anonymous: boolean;
}

export type FriendRequestResult = "sent" | "accepted" | "pending" | "friends";
