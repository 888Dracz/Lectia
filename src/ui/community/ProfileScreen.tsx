import { ArrowLeft, Check, Clock, Flame, Pencil, Settings, Share2, UserCheck, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApi } from "../../community/api";
import { genreEmoji, momentLabel } from "../../community/catalog";
import { division } from "../../community/divisions";
import { liveStreak } from "../../community/streaks";
import { initCommunity, removeFriend, reportError, requestFriend, respondFriend, setPendingInvite, useCommunity } from "../../community/store";
import type { Post, Profile, PublicProfile } from "../../community/types";
import { goBack, navigate } from "../../lib/router";
import { dayKey, formatNumber } from "../../lib/util";
import { ACHIEVEMENTS, levelFromXp, streakOf } from "../../store/gamification";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { Bar } from "../components/controls";
import { confirmDialog } from "../components/Dialog";
import { AccountSheet } from "./AccountSheet";
import { DemoBanner } from "./CommunityScreen";
import { Avatar, DivisionBadge, ErrorRetry, Loading, shareProfile } from "./parts";
import { PostCard } from "./PostCard";
import { ProfileEditor } from "./ProfileEditor";

export function ProfileScreen({ username }: { username?: string }) {
  const me = useCommunity((s) => s.profile);
  const status = useCommunity((s) => s.status);
  const progress = useStore((s) => s.progress);
  const [data, setData] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [state, setState] = useState<"loading" | "error" | "missing" | "ok">("loading");
  const [editing, setEditing] = useState(false);
  const [account, setAccount] = useState(false);

  const self = !username || username === me?.username;
  const key = self ? me?.username : username;

  useEffect(() => {
    void initCommunity();
  }, []);

  const load = useCallback(async () => {
    if (!key || !me) return;
    try {
      const api = await getApi();
      const p = await api.getProfile(key, dayKey());
      if (!p) {
        setState("missing");
        return;
      }
      setData(p);
      setState("ok");
      if (p.relation === "self" || p.relation === "friends") setPosts(await api.getFeed({ userId: p.id, limit: 10 }));
      else setPosts(null);
    } catch (e) {
      if (!data) setState("error");
      else reportError(e);
    }
  }, [key, me?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const header = (
    <header className="profile-bar">
      <button className="icon-btn" aria-label="Volver" onClick={() => goBack({ name: "community", tab: "league" })}>
        <ArrowLeft size={22} />
      </button>
      <span className="profile-bar-title ellipsis">{key ? `@${key}` : "Perfil"}</span>
      {self && me && (
        <>
          <button className="icon-btn" aria-label="Compartir perfil" onClick={() => void shareProfile(me.username, (t) => toast(t, { tone: "success" }))}>
            <Share2 size={20} />
          </button>
          <button className="icon-btn" aria-label="Cuenta y privacidad" onClick={() => setAccount(true)}>
            <Settings size={20} />
          </button>
        </>
      )}
    </header>
  );

  if (!me) {
    return (
      <div className="screen profile">
        {header}
        {status !== "ready" ? (
          <Loading />
        ) : (
          <div className="cm-empty">
            <div className="cm-empty-emoji">👋</div>
            <b>{username ? `Crea tu perfil para agregar a @${username}` : "Todavía no tienes perfil"}</b>
            <p className="muted">Únete a la comunidad de Lectia: ligas semanales, rachas con amigos y novedades.</p>
            <button
              className="btn btn-primary"
              style={{ marginTop: 14 }}
              onClick={() => {
                setPendingInvite(username ?? null);
                navigate({ name: "community", tab: "friends" });
              }}
            >
              Crear mi perfil
            </button>
          </div>
        )}
      </div>
    );
  }

  // Lo propio se muestra con los datos locales (siempre al día).
  const local = streakOf(progress);
  const p: (PublicProfile | (Profile & Partial<PublicProfile>)) | null = self ? { ...(data ?? me), ...me, relation: "self" } : data;

  return (
    <div className="screen profile">
      {header}
      <DemoBanner />
      {!p ? (
        state === "error" ? (
          <ErrorRetry onRetry={() => void load()} />
        ) : state === "missing" ? (
          <div className="cm-empty">
            <div className="cm-empty-emoji">🔍</div>
            <b>No encontramos a @{username}</b>
          </div>
        ) : (
          <Loading />
        )
      ) : (
        <ProfileBody
          p={p}
          self={self}
          streak={self ? local.current : liveStreak(p).days}
          streakToday={self ? local.todayDone : liveStreak(p).today}
          totalXp={self ? progress.xp : p.total_xp}
          booksFinished={self ? progress.booksFinished : p.books_finished}
          achievements={self ? Object.keys(progress.achievements) : p.achievements}
          posts={posts}
          onPostDeleted={(id) => setPosts((list) => list?.filter((x) => x.id !== id) ?? null)}
          onEdit={() => setEditing(true)}
          reload={() => void load()}
        />
      )}
      {self && <ProfileEditor open={editing} profile={me} onClose={() => setEditing(false)} onSaved={() => void load()} />}
      {self && <AccountSheet open={account} onClose={() => setAccount(false)} />}
    </div>
  );
}

interface BodyProps {
  p: Profile & Partial<PublicProfile>;
  self: boolean;
  streak: number;
  streakToday: boolean;
  totalXp: number;
  booksFinished: number;
  achievements: string[];
  posts: Post[] | null;
  onPostDeleted: (id: string) => void;
  onEdit: () => void;
  reload: () => void;
}

function ProfileBody({ p, self, streak, streakToday, totalXp, booksFinished, achievements, posts, onPostDeleted, onEdit, reload }: BodyProps) {
  const me = useCommunity((s) => s.profile)!;
  const div = division(p.division);
  const lvl = levelFromXp(totalXp);
  const moment = momentLabel(p.reading_moment);
  const since = new Date(p.created_at).toLocaleDateString("es", { month: "long", year: "numeric" });
  const unlocked = ACHIEVEMENTS.filter((a) => achievements.includes(a.id));
  const first = p.display_name.split(" ")[0];

  const relate = async () => {
    try {
      if (p.relation === "none") {
        const r = await requestFriend(p.username);
        toast(r === "accepted" ? `¡Ahora eres amigo/a de ${first}!` : "Solicitud enviada", { tone: "success" });
      } else if (p.relation === "pending_in") {
        await respondFriend(p.id, true);
        toast(`¡Ahora eres amigo/a de ${first}!`, { tone: "success" });
      } else if (p.relation === "pending_out") {
        if (!(await confirmDialog("¿Cancelar la solicitud?", undefined, "Cancelar solicitud"))) return;
        await removeFriend(p.id);
      } else if (p.relation === "friends") {
        if (!(await confirmDialog(`¿Quitar a ${first} de tus amigos?`, "Perderán su racha de amigos y dejarán de ver sus novedades.", "Quitar", true))) return;
        await removeFriend(p.id);
      }
      reload();
    } catch (e) {
      reportError(e);
    }
  };

  return (
    <>
      <section className="profile-hero" style={{ ["--av" as string]: "var(--accent)" }}>
        <Avatar user={p} size={104} className="profile-avatar" />
        <h1 className="display profile-name">{p.display_name}</h1>
        <div className="faint">
          @{p.username} · desde {since}
        </div>
        {p.sample && <span className="sample-tag">Lector de ejemplo</span>}
        {typeof p.friends_count === "number" && (
          <div className="profile-friends muted">
            {p.friends_count} {p.friends_count === 1 ? "amigo" : "amigos"}
          </div>
        )}
        {p.bio && <p className="profile-bio">{p.bio}</p>}
        <div className="profile-actions">
          {self ? (
            <button className="btn btn-primary" onClick={onEdit}>
              <Pencil size={17} /> Editar perfil
            </button>
          ) : (
            <button className={`btn ${p.relation === "none" || p.relation === "pending_in" ? "btn-primary" : "btn-outline"}`} onClick={() => void relate()}>
              {p.relation === "none" && (
                <>
                  <UserPlus size={17} /> Agregar amigo
                </>
              )}
              {p.relation === "pending_in" && (
                <>
                  <Check size={17} /> Aceptar solicitud
                </>
              )}
              {p.relation === "pending_out" && (
                <>
                  <Clock size={17} /> Solicitud enviada
                </>
              )}
              {p.relation === "friends" && (
                <>
                  <UserCheck size={17} /> Amigos
                </>
              )}
            </button>
          )}
        </div>
      </section>

      {!self && p.relation === "friends" && (
        <div className={`friend-streak-banner ${p.friend_streak ? "" : "zero"}`}>
          <Flame size={26} />
          <div>
            <b>{p.friend_streak ? `${p.friend_streak} ${p.friend_streak === 1 ? "día" : "días"} de racha juntos` : "Sin racha juntos todavía"}</b>
            <span>{p.friend_streak ? "Lean los dos cada día para mantenerla." : "Lean el mismo día para empezar una."}</span>
          </div>
          <div className="fsb-faces">
            <Avatar user={me} size={30} />
            <Avatar user={p} size={30} />
          </div>
        </div>
      )}

      <div className="profile-stats">
        <div className={`pstat ${streakToday ? "lit" : ""}`}>
          <Flame size={22} />
          <b>{streak}</b>
          <span>días de racha</span>
        </div>
        <div className="pstat">
          <span className="pstat-emoji">✨</span>
          <b>{formatNumber(totalXp)}</b>
          <span>polvo de hadas</span>
        </div>
        <div className="pstat">
          <DivisionBadge div={div.id} size={24} />
          <b>{div.name}</b>
          <span>división</span>
        </div>
        <div className="pstat">
          <span className="pstat-emoji">{lvl.rank.emoji}</span>
          <b>Nivel {lvl.level}</b>
          <span>{lvl.rank.name}</span>
        </div>
        <div className="pstat">
          <span className="pstat-emoji">📚</span>
          <b>{formatNumber(booksFinished)}</b>
          <span>libros terminados</span>
        </div>
        <div className="pstat">
          <span className="pstat-emoji">🏅</span>
          <b>{p.best_streak ? Math.max(p.best_streak, streak) : streak}</b>
          <span>mejor racha</span>
        </div>
      </div>

      {p.reading_now && (
        <section className="section">
          <div className="section-title">Leyendo ahora</div>
          <div className="card reading-now">
            <span className="reading-now-emoji">📖</span>
            <div>
              <b className="display">{p.reading_now.title}</b>
              {p.reading_now.author && <div className="muted">{p.reading_now.author}</div>}
            </div>
          </div>
        </section>
      )}

      {p.yearly_goal > 0 && (
        <section className="section">
          <div className="section-title">
            <span>Meta de {new Date().getFullYear()}</span>
            <span className="section-aside">
              {p.books_this_year} de {p.yearly_goal} libros
            </span>
          </div>
          <div className="card goal-card">
            <Bar value={p.books_this_year / p.yearly_goal} />
          </div>
        </section>
      )}

      {(p.genres.length > 0 || p.favorite_book || p.favorite_authors || moment) && (
        <section className="section">
          <div className="section-title">Sus gustos</div>
          {p.genres.length > 0 && (
            <div className="profile-genres">
              {p.genres.map((g) => (
                <span key={g} className="chip">
                  {genreEmoji(g)} {g}
                </span>
              ))}
            </div>
          )}
          <div className="list profile-facts">
            {p.favorite_book && (
              <div className="list-item">
                <span className="li-icon emoji">💛</span>
                <span className="li-main">
                  <div className="li-sub">Libro favorito</div>
                  <div className="li-title">{p.favorite_book}</div>
                </span>
              </div>
            )}
            {p.favorite_authors && (
              <div className="list-item">
                <span className="li-icon emoji">✒️</span>
                <span className="li-main">
                  <div className="li-sub">Autores favoritos</div>
                  <div className="li-title">{p.favorite_authors}</div>
                </span>
              </div>
            )}
            {moment && (
              <div className="list-item">
                <span className="li-icon emoji">{moment.emoji}</span>
                <span className="li-main">
                  <div className="li-sub">Lee sobre todo</div>
                  <div className="li-title">{moment.label.toLowerCase()}</div>
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-title">
          <span>Logros</span>
          <span className="section-aside">
            {unlocked.length} / {ACHIEVEMENTS.length}
          </span>
        </div>
        {unlocked.length ? (
          <div className="profile-achievements">
            {unlocked.map((a) => (
              <span key={a.id} className="pach" title={a.title}>
                <span className="ach-icon">{a.icon}</span>
                <span className="pach-title">{a.title}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="faint">Todavía sin logros.</p>
        )}
      </section>

      <section className="section">
        <div className="section-title">Novedades</div>
        {posts === null ? (
          p.relation === "friends" || self ? (
            <Loading />
          ) : (
            <p className="faint">Agrega a {first} como amigo/a para ver lo que comparte.</p>
          )
        ) : posts.length === 0 ? (
          <p className="faint">{self ? "Aún no compartiste nada." : "Todavía no compartió nada."}</p>
        ) : (
          <div className="feed">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} mine={post.user_id === me.id} onDeleted={onPostDeleted} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
