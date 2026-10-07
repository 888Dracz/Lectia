import { Flame, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { division } from "../../community/divisions";
import { initCommunity, takePendingInvite, useCommunity } from "../../community/store";
import { navigate, type CommunityTab } from "../../lib/router";
import { formatNumber } from "../../lib/util";
import { streakOf } from "../../store/gamification";
import { useStore } from "../../store/store";
import { AccountSheet } from "./AccountSheet";
import { FeedView } from "./FeedView";
import { FriendsView } from "./FriendsView";
import { LeagueView } from "./LeagueView";
import { Avatar, DivisionBadge, Loading } from "./parts";
import { ProfileEditor } from "./ProfileEditor";

const TABS: { id: CommunityTab; label: string }[] = [
  { id: "league", label: "Liga" },
  { id: "friends", label: "Amigos" },
  { id: "feed", label: "Novedades" },
];

export function DemoBanner() {
  const mode = useCommunity((s) => s.mode);
  if (mode !== "demo") return null;
  return (
    <div className="demo-banner">
      <b>Vista previa</b> La comunidad aún no está conectada a un servidor: los lectores que ves son de ejemplo y nada sale de este teléfono.
    </div>
  );
}

export function CommunityScreen({ tab }: { tab: CommunityTab }) {
  const status = useCommunity((s) => s.status);
  const profile = useCommunity((s) => s.profile);
  const badges = useCommunity((s) => s.badges);
  const league = useCommunity((s) => s.league);
  const weekXpSynced = useCommunity((s) => s.weekXp);
  const progress = useStore((s) => s.progress);

  useEffect(() => {
    void initCommunity();
  }, []);

  if (!profile) {
    return (
      <div className="screen community">
        <header className="screen-header">
          <div>
            <div className="eyebrow">Lectores como tú</div>
            <h1 className="screen-title">Comunidad</h1>
          </div>
        </header>
        <DemoBanner />
        {status !== "ready" ? <Loading /> : <Welcome />}
      </div>
    );
  }

  const streak = streakOf(progress);
  const div = division(league?.division ?? profile.division);
  const weekXp = Math.max(weekXpSynced, league?.members.find((m) => m.id === profile.id)?.xp ?? 0);

  return (
    <div className="screen community">
      <header className="screen-header">
        <div>
          <div className="eyebrow">Lectores como tú</div>
          <h1 className="screen-title">Comunidad</h1>
        </div>
        <button className="cm-me" onClick={() => navigate({ name: "profile" })} aria-label="Mi perfil">
          <Avatar user={profile} size={44} />
        </button>
      </header>
      <DemoBanner />

      <div className="cm-stats">
        <div className="cm-stat">
          <Flame size={18} className={streak.todayDone ? "flame on" : "flame"} />
          <b>{streak.current}</b>
          <span>racha</span>
        </div>
        <div className="cm-stat">
          <DivisionBadge div={div.id} size={20} />
          <b>{div.name}</b>
          <span>división</span>
        </div>
        <div className="cm-stat">
          <Sparkles size={17} className="spark" />
          <b>{formatNumber(weekXp)}</b>
          <span>esta semana</span>
        </div>
      </div>

      <div className="segmented cm-tabs" role="tablist">
        {TABS.map((t) => {
          const badge = t.id === "friends" ? badges.requests : t.id === "feed" ? badges.posts : 0;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => navigate({ name: "community", tab: t.id })}
            >
              {t.label}
              {badge > 0 && <span className="tab-badge">{badge > 9 ? "9+" : badge}</span>}
            </button>
          );
        })}
      </div>

      {tab === "league" && <LeagueView />}
      {tab === "friends" && <FriendsView />}
      {tab === "feed" && <FeedView />}
    </div>
  );
}

function Welcome() {
  const [editing, setEditing] = useState(false);
  const [login, setLogin] = useState(false);
  const mode = useCommunity((s) => s.mode);
  return (
    <div className="welcome">
      <div className="welcome-hero">
        <div className="welcome-badges" aria-hidden>
          <DivisionBadge div={0} size={44} />
          <DivisionBadge div={2} size={58} />
          <DivisionBadge div={9} size={44} />
        </div>
        <h2 className="display">Lee con más ganas, en compañía</h2>
        <p className="muted">Crea tu perfil para competir en ligas semanales, tener rachas con tus amigos y compartir lo que lees.</p>
      </div>
      <div className="welcome-features">
        <div>
          <span>🏆</span>
          <b>Ligas y divisiones</b>
          <p className="faint">Cada semana compites con hasta 30 lectores. Los primeros suben de división: de Bronce a Diamante.</p>
        </div>
        <div>
          <span>🔥</span>
          <b>Rachas de amigos</b>
          <p className="faint">Lean el mismo día para mantener una racha juntos y mira las rachas de los demás.</p>
        </div>
        <div>
          <span>❤️</span>
          <b>Novedades con me gusta</b>
          <p className="faint">Comparte libros, citas y logros. Sin chats ni comentarios: solo lectura y apoyo.</p>
        </div>
      </div>
      <button className="btn btn-primary btn-block" onClick={() => setEditing(true)}>
        Crear mi perfil
      </button>
      {mode === "online" && (
        <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => setLogin(true)}>
          Ya tengo cuenta: entrar con mi correo
        </button>
      )}
      <ProfileEditor
        open={editing}
        profile={null}
        onClose={() => setEditing(false)}
        onSaved={() => {
          // Si llegó con un enlace de invitación, se vuelve a ese perfil.
          const invite = takePendingInvite();
          if (invite) setTimeout(() => navigate({ name: "profile", username: invite }), 300);
        }}
      />
      <AccountSheet open={login} onClose={() => setLogin(false)} startWith="login" />
    </div>
  );
}
