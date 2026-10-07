import { ArrowDown, ArrowUp, Clock, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DIVISIONS, division, formatTimeLeft, GROUP_SIZE, zoneOf, zoneText } from "../../community/divisions";
import { shiftDay } from "../../community/streaks";
import { refreshLeague, reportError, useCommunity } from "../../community/store";
import { navigate } from "../../lib/router";
import { formatNumber } from "../../lib/util";
import { Avatar, DivisionBadge, ErrorRetry, Loading, StreakChip } from "./parts";

const OUTCOME = {
  promoted: { text: "subiste", icon: <ArrowUp size={14} /> },
  demoted: { text: "bajaste", icon: <ArrowDown size={14} /> },
  stayed: { text: "te mantuviste", icon: null },
};

export function LeagueView() {
  const league = useCommunity((s) => s.league);
  const me = useCommunity((s) => s.profile);
  const [state, setState] = useState<"loading" | "error" | "ok">(league ? "ok" : "loading");
  const [, tick] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  const load = () => {
    setState((s) => (s === "ok" ? s : "loading"));
    refreshLeague()
      .then(() => setState("ok"))
      .catch((e) => {
        if (!useCommunity.getState().league) setState("error");
        else reportError(e);
      });
  };
  useEffect(load, []);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    strip.current?.querySelector(".div-step.current")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [league?.division]);

  if (!league || !me) return state === "error" ? <ErrorRetry onRetry={load} /> : <Loading />;

  const div = division(league.division);
  const size = league.members.length;
  const prev = league.previous && league.previous.week === shiftDay(league.week, -7) ? league.previous : null;

  return (
    <div className="league">
      <div className="div-strip" ref={strip}>
        {DIVISIONS.map((d) => (
          <div key={d.id} className={`div-step ${d.id === div.id ? "current" : ""} ${d.id < div.id ? "past" : ""}`}>
            <DivisionBadge div={d.id} size={d.id === div.id ? 62 : 38} locked={d.id > div.id} />
          </div>
        ))}
      </div>

      <div className="league-head">
        <h2 className="display">División {div.name}</h2>
        <p className="muted">{zoneText(div.id, league.joined ? size : GROUP_SIZE)}</p>
        <div className="league-timer">
          <Clock size={14} /> Termina en {formatTimeLeft(Date.parse(league.ends_at))}
        </div>
      </div>

      {prev && (
        <div className={`league-prev ${prev.outcome}`}>
          {OUTCOME[prev.outcome].icon}
          <span>
            La semana pasada quedaste <b>{prev.rank}º</b> de {prev.size} en {division(prev.division).name} y {OUTCOME[prev.outcome].text}.
          </span>
        </div>
      )}

      {!league.joined ? (
        <div className="card league-join">
          <div className="league-join-emoji">📖</div>
          <b>Lee o entrena para entrar a la liga de esta semana</b>
          <p className="muted">
            Con tu primer polvo de hadas ✨ de la semana entrarás a un grupo de hasta {GROUP_SIZE} lectores de la división {div.name}. Cada minuto de lectura y cada
            minijuego suman.
          </p>
          <button className="btn btn-primary" onClick={() => navigate({ name: "library" })}>
            Leer ahora
          </button>
        </div>
      ) : (
        <ol className="league-list">
          {league.members.map((m) => {
            const zone = zoneOf(m.rank, size, div.id, m.xp);
            const mine = m.id === me.id;
            return (
              <li key={m.id}>
                {league.demote > 0 && m.rank === size - league.demote + 1 && (
                  <div className="zone-sep demote">
                    <ArrowDown size={14} /> Zona de descenso
                  </div>
                )}
                <button className={`lrow zone-${zone} ${mine ? "me" : ""}`} onClick={() => navigate({ name: "profile", username: m.username })}>
                  <span className={`lrank r${m.rank}`}>{m.rank}</span>
                  <Avatar user={m} size={40} />
                  <span className="lname">
                    <b className="ellipsis">{mine ? "Tú" : m.display_name}</b>
                    <StreakChip user={m} />
                  </span>
                  <span className="lxp">
                    {formatNumber(m.xp)} <Sparkles size={13} />
                  </span>
                </button>
                {league.promote > 0 && m.rank === league.promote && size > league.promote && (
                  <div className="zone-sep promote">
                    <ArrowUp size={14} /> Zona de ascenso
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="faint league-foot">Cada semana empieza una liga nueva. Gana polvo de hadas leyendo, entrenando y cumpliendo retos.</p>
    </div>
  );
}
