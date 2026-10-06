import { Flame, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays, dayKey, formatDate, formatHours, formatNumber } from "../../lib/util";
import { ACHIEVEMENTS, computeStreak, dailyQuests, levelFromXp } from "../../store/gamification";
import { useStore } from "../../store/store";
import { Bar, Ring } from "../components/controls";
import { Sheet } from "../components/Sheet";
import { QuestList } from "../games/TrainScreen";

const WEEKDAYS = ["D", "L", "M", "M", "J", "V", "S"];

export function ProgressScreen() {
  const progress = useStore((s) => s.progress);
  const books = useStore((s) => s.books);
  const goal = useStore((s) => s.app.dailyGoalMin);
  const [achOpen, setAchOpen] = useState<string | null>(null);

  const lvl = levelFromXp(progress.xp);
  const streak = computeStreak(progress.days);
  const today = progress.days[dayKey()];
  const todayMin = Math.floor((today?.ms ?? 0) / 60000);
  const totalMs = Object.values(progress.days).reduce((a, d) => a + d.ms, 0);
  const readingBooks = Object.values(books).filter((b) => b.status === "reading").length;

  const week = useMemo(() => {
    const out: { key: string; label: string; min: number; isToday: boolean }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = addDays(now, -i);
      const k = dayKey(d);
      out.push({ key: k, label: WEEKDAYS[d.getDay()], min: Math.round((progress.days[k]?.ms ?? 0) / 60000), isToday: i === 0 });
    }
    return out;
  }, [progress.days]);
  const weekTotal = week.reduce((a, d) => a + d.min, 0);
  const weekMax = Math.max(goal * 1.2, ...week.map((d) => d.min));

  const heat = useMemo(() => {
    // 18 semanas, columnas de domingo a sábado.
    const now = new Date();
    const end = addDays(now, 6 - now.getDay());
    const start = addDays(end, -18 * 7 + 1);
    const cells: { key: string; min: number; future: boolean }[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const k = dayKey(d);
      cells.push({ key: k, min: (progress.days[k]?.ms ?? 0) / 60000, future: d > now });
    }
    return cells;
  }, [progress.days]);

  const wpm = progress.wpmHistory.slice(-12);
  const unlocked = ACHIEVEMENTS.filter((a) => progress.achievements[a.id]).length;
  const selected = ACHIEVEMENTS.find((a) => a.id === achOpen);

  return (
    <div className="screen progress">
      <header className="screen-header">
        <div>
          <div className="eyebrow">Tu camino lector</div>
          <h1 className="screen-title">Progreso</h1>
        </div>
      </header>

      <div className="level-hero">
        <div className="level-hero-glow" />
        <div className="level-hero-badge">{lvl.rank.emoji}</div>
        <div className="level-hero-text">
          <div className="level-hero-kicker">Nivel {lvl.level}</div>
          <div className="level-hero-rank display">{lvl.rank.name}</div>
          <Bar value={lvl.progress} />
          <div className="level-hero-xp">
            <Sparkles size={13} /> {formatNumber(progress.xp)} polvo de hadas · faltan {formatNumber(lvl.xpForNext - lvl.xpIntoLevel)} para subir
          </div>
        </div>
      </div>

      <div className="today-row">
        <div className="card today-card">
          <Ring value={todayMin / goal} size={92} stroke={9}>
            <div className="today-ring-label">
              <b>{todayMin}</b>
              <span>de {goal} min</span>
            </div>
          </Ring>
          <div className="today-caption">{todayMin >= goal ? "¡Meta cumplida! 🎉" : "Meta de hoy"}</div>
        </div>
        <div className="card streak-card">
          <Flame size={34} className={streak.todayDone ? "flame on big" : "flame big"} />
          <div className="streak-num">{streak.current}</div>
          <div className="streak-label">{streak.current === 1 ? "día seguido" : "días seguidos"}</div>
          <div className="faint streak-best">Mejor racha: {streak.best}</div>
        </div>
      </div>

      <section className="section">
        <div className="section-title">Retos de hoy</div>
        <QuestList quests={dailyQuests(today, goal)} done={today?.quests ?? []} />
      </section>

      <section className="section">
        <div className="section-title">
          <span>Esta semana</span>
          <span className="section-aside">{weekTotal} min</span>
        </div>
        <div className="card week-chart">
          <div className="week-plot" aria-hidden>
            <div className="week-goal" style={{ bottom: `${(goal / weekMax) * 100}%` }}>
              <span>meta</span>
            </div>
          </div>
          {week.map((d) => (
            <div key={d.key} className={`week-col ${d.isToday ? "today" : ""}`}>
              <div className="week-bar-wrap">
                <div className={`week-bar ${d.min >= goal ? "met" : ""}`} style={{ height: `${Math.max(d.min ? 4 : 0, (d.min / weekMax) * 100)}%` }}>
                  {d.min > 0 && <span className="week-val">{d.min}</span>}
                </div>
              </div>
              <span className="week-day">{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-title">Calendario de lectura</div>
        <div className="card heat-card">
          <div className="heat">
            {heat.map((c) => (
              <span
                key={c.key}
                title={`${c.key}: ${Math.round(c.min)} min`}
                className={`heat-cell ${c.future ? "future" : ""}`}
                data-l={c.min <= 0 ? 0 : c.min < goal * 0.34 ? 1 : c.min < goal * 0.67 ? 2 : c.min < goal ? 3 : 4}
              />
            ))}
          </div>
          <div className="heat-legend">
            <span>menos</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className="heat-cell" data-l={l} />
            ))}
            <span>más</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">En números</div>
        <div className="totals">
          <Total value={formatHours(totalMs)} label="leídas en total" emoji="⏳" />
          <Total value={formatNumber(progress.booksFinished)} label="libros terminados" emoji="🏁" />
          <Total value={formatNumber(readingBooks)} label="leyendo ahora" emoji="📖" />
          <Total value={formatNumber(progress.totalPages)} label="páginas pasadas" emoji="📄" />
          <Total value={formatNumber(progress.totalRsvpWords)} label="palabras en modo rápido" emoji="⚡" />
          <Total value={progress.bestRsvpWpm ? `${progress.bestRsvpWpm}` : "—"} label="ppm máximas (rápida)" emoji="🚀" />
        </div>
      </section>

      {wpm.length > 0 && (
        <section className="section">
          <div className="section-title">
            <span>Test de velocidad</span>
            <span className="section-aside">último: {wpm[wpm.length - 1].wpm} ppm</span>
          </div>
          <div className="card">
            <WpmChart samples={wpm} />
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-title">
          <span>Logros</span>
          <span className="section-aside">
            {unlocked} / {ACHIEVEMENTS.length}
          </span>
        </div>
        <div className="ach-grid">
          {ACHIEVEMENTS.map((a) => {
            const at = progress.achievements[a.id];
            return (
              <button key={a.id} className={`ach ${at ? "on" : ""}`} onClick={() => setAchOpen(a.id)}>
                <span className="ach-icon">{at ? a.icon : "🔒"}</span>
                <span className="ach-title">{a.title}</span>
              </button>
            );
          })}
        </div>
      </section>

      <Sheet open={!!selected} onClose={() => setAchOpen(null)}>
        {selected && (
          <div className="ach-detail">
            <div className={`ach-big ${progress.achievements[selected.id] ? "on" : ""}`}>{progress.achievements[selected.id] ? selected.icon : "🔒"}</div>
            <h3 className="display">{selected.title}</h3>
            <p className="muted">{selected.description}</p>
            <p className="faint">
              {progress.achievements[selected.id] ? `Desbloqueado el ${formatDate(progress.achievements[selected.id])}` : `Recompensa: ${selected.xp} ✨`}
            </p>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Total({ value, label, emoji }: { value: string; label: string; emoji: string }) {
  return (
    <div className="total">
      <span className="total-emoji">{emoji}</span>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function WpmChart({ samples }: { samples: { at: number; wpm: number; comprehension: number }[] }) {
  const W = 300;
  const H = 110;
  const max = Math.max(...samples.map((s) => s.wpm)) * 1.15;
  const min = Math.min(...samples.map((s) => s.wpm)) * 0.8;
  const x = (i: number) => (samples.length === 1 ? W / 2 : 14 + (i * (W - 28)) / (samples.length - 1));
  const y = (v: number) => H - 16 - ((v - min) / Math.max(1, max - min)) * (H - 34);
  const path = samples.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.wpm).toFixed(1)}`).join(" ");
  const area = `${path} L${x(samples.length - 1)},${H - 6} L${x(0)},${H - 6} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="wpm-chart" role="img" aria-label="Evolución de palabras por minuto">
      <defs>
        <linearGradient id="wpmfill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#wpmfill)" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {samples.map((s, i) => (
        <g key={s.at}>
          <circle cx={x(i)} cy={y(s.wpm)} r="4" fill="var(--bg-elev)" stroke="var(--accent)" strokeWidth="2" />
          {(i === samples.length - 1 || samples.length <= 6) && (
            <text x={x(i)} y={y(s.wpm) - 9} textAnchor="middle" className="wpm-label">
              {s.wpm}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
