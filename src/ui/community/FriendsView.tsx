import { Check, Flame, Link2, Search, Sparkles, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getApi } from "../../community/api";
import { liveStreak } from "../../community/streaks";
import { refreshFriends, removeFriend, reportError, requestFriend, respondFriend, useCommunity } from "../../community/store";
import type { Friend, UserSummary } from "../../community/types";
import { navigate } from "../../lib/router";
import { formatNumber } from "../../lib/util";
import { streakOf } from "../../store/gamification";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { Avatar, EmptyNote, ErrorRetry, Loading, shareProfile, StreakChip } from "./parts";

const REQUEST_TEXT = {
  sent: "Solicitud enviada",
  accepted: "¡Ahora son amigos!",
  pending: "Ya le enviaste una solicitud",
  friends: "Ya son amigos",
};

export function FriendsView() {
  const data = useCommunity((s) => s.friends);
  const me = useCommunity((s) => s.profile);
  const mode = useCommunity((s) => s.mode);
  const progress = useStore((s) => s.progress);
  const [state, setState] = useState<"loading" | "error" | "ok">(data ? "ok" : "loading");

  const load = () => {
    refreshFriends()
      .then(() => setState("ok"))
      .catch((e) => {
        if (!useCommunity.getState().friends) setState("error");
        else reportError(e);
      });
  };
  useEffect(load, []);

  if (!me) return null;
  if (!data) return state === "error" ? <ErrorRetry onRetry={load} /> : <Loading />;

  const meToday = streakOf(progress).todayDone;
  const ranking = [
    { ...me, week_xp: data.my_week_xp, mine: true },
    ...data.friends.map((f) => ({ ...f, mine: false })),
  ].sort((a, b) => b.week_xp - a.week_xp);

  return (
    <div className="friends">
      <AddFriend username={me.username} demo={mode === "demo"} />

      {data.incoming.length > 0 && (
        <section className="section">
          <div className="section-title">Solicitudes de amistad</div>
          <div className="list">
            {data.incoming.map((u) => (
              <div key={u.id} className="list-item">
                <button className="fr-who" onClick={() => navigate({ name: "profile", username: u.username })}>
                  <Avatar user={u} size={40} />
                  <span className="li-main">
                    <div className="li-title ellipsis">{u.display_name}</div>
                    <div className="li-sub">@{u.username}</div>
                  </span>
                </button>
                <button
                  className="icon-btn filled"
                  aria-label="Rechazar"
                  onClick={() => respondFriend(u.id, false).catch((e) => reportError(e))}
                >
                  <X size={18} />
                </button>
                <button
                  className="icon-btn accent"
                  aria-label="Aceptar"
                  onClick={() =>
                    respondFriend(u.id, true)
                      .then(() => toast(`¡Ahora eres amigo/a de ${u.display_name}!`, { tone: "success" }))
                      .catch((e) => reportError(e))
                  }
                >
                  <Check size={18} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.friends.length === 0 ? (
        <EmptyNote emoji="🤝" title="Todavía no tienes amigos en Lectia">
          Agrega a tus amigos para tener rachas juntos, competir en el ranking semanal y ver los libros que comparten.
        </EmptyNote>
      ) : (
        <>
          <section className="section">
            <div className="section-title">
              <span>Rachas de amigos</span>
              <span className="section-aside">{data.friends.filter((f) => f.friend_streak > 0).length} activas</span>
            </div>
            <div className="fstreaks">
              {data.friends.map((f) => (
                <FriendStreakCard key={f.id} friend={f} me={me} meToday={meToday} />
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-title">
              <span>Ranking semanal de amigos</span>
              <span className="section-aside">polvo de hadas</span>
            </div>
            <ol className="league-list compact">
              {ranking.map((u, i) => (
                <li key={u.id}>
                  <button className={`lrow ${u.mine ? "me" : ""}`} onClick={() => navigate({ name: "profile", username: u.username })}>
                    <span className={`lrank r${i + 1}`}>{i + 1}</span>
                    <Avatar user={u} size={36} />
                    <span className="lname">
                      <b className="ellipsis">{u.mine ? "Tú" : u.display_name}</b>
                      {!u.mine && <StreakChip user={u} />}
                    </span>
                    <span className="lxp">
                      {formatNumber(u.week_xp)} <Sparkles size={13} />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      {data.outgoing.length > 0 && (
        <section className="section">
          <div className="section-title">Esperando respuesta</div>
          <div className="list">
            {data.outgoing.map((u) => (
              <div key={u.id} className="list-item">
                <button className="fr-who" onClick={() => navigate({ name: "profile", username: u.username })}>
                  <Avatar user={u} size={36} />
                  <span className="li-main">
                    <div className="li-title ellipsis">{u.display_name}</div>
                    <div className="li-sub">@{u.username}</div>
                  </span>
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => removeFriend(u.id).catch((e) => reportError(e))}>
                  Cancelar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FriendStreakCard({ friend, me, meToday }: { friend: Friend; me: UserSummary; meToday: boolean }) {
  const theirs = liveStreak(friend);
  const first = friend.display_name.split(" ")[0];
  const both = meToday && theirs.today;
  const status =
    friend.friend_streak === 0
      ? "Lean el mismo día para empezar una racha juntos"
      : both
        ? "¡Los dos leyeron hoy!"
        : meToday
          ? `Falta que ${first} lea hoy`
          : theirs.today
            ? `${first} ya leyó hoy: ¡te toca!`
            : "Lean hoy para no perderla";
  return (
    <button className={`fstreak ${both ? "lit" : ""} ${friend.friend_streak ? "" : "zero"}`} onClick={() => navigate({ name: "profile", username: friend.username })}>
      <span className="fstreak-faces">
        <Avatar user={me} size={34} />
        <Avatar user={friend} size={34} />
      </span>
      <span className="fstreak-num">
        <Flame size={20} />
        {friend.friend_streak}
      </span>
      <span className="fstreak-name ellipsis">{friend.display_name}</span>
      <span className="fstreak-status">{status}</span>
    </button>
  );
}

function AddFriend({ username, demo }: { username: string; demo: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.replace(/^@/, "").length < 2) {
      setResults(null);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const api = await getApi();
        setResults(await api.searchUsers(q));
      } catch {
        setResults(null);
      }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [query]);

  const add = async (name: string) => {
    setBusy(true);
    try {
      const r = await requestFriend(name);
      toast(REQUEST_TEXT[r], { tone: r === "sent" || r === "accepted" ? "success" : "default" });
      if (r === "sent" && demo) toast("En la demostración, las solicitudes se aceptan solas en unos segundos.", {}, 4000);
      setQuery("");
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card add-friend">
      <div className="add-friend-head">
        <UserPlus size={20} />
        <b>Agregar amigos</b>
      </div>
      <form
        className="add-friend-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) void add(query.trim());
        }}
      >
        <div className="field-icon">
          <Search size={17} />
          <input
            className="field"
            value={query}
            placeholder="Busca por nombre o @usuario"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar personas"
          />
        </div>
      </form>
      {results && (
        <div className="list search-results">
          {results.length === 0 ? (
            <div className="list-item faint">Nadie con ese nombre todavía.</div>
          ) : (
            results.map((u) => (
              <div key={u.id} className="list-item">
                <button className="fr-who" onClick={() => navigate({ name: "profile", username: u.username })}>
                  <Avatar user={u} size={36} />
                  <span className="li-main">
                    <div className="li-title ellipsis">{u.display_name}</div>
                    <div className="li-sub">@{u.username}</div>
                  </span>
                </button>
                <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => void add(u.username)}>
                  Agregar
                </button>
              </div>
            ))
          )}
        </div>
      )}
      <button className="btn btn-sm btn-outline add-friend-share" onClick={() => void shareProfile(username, (t) => toast(t, { tone: "success" }))}>
        <Link2 size={16} /> Invitar con mi enlace · @{username}
      </button>
    </div>
  );
}
