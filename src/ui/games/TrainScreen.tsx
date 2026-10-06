import { BookOpen, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { navigate } from "../../lib/router";
import { dayKey } from "../../lib/util";
import { dailyQuests, levelFromXp } from "../../store/gamification";
import { useStore } from "../../store/store";
import { Cover } from "../components/Cover";
import { Bar } from "../components/controls";
import { Sheet } from "../components/Sheet";
import { GAMES } from "./catalog";

export function TrainScreen() {
  const progress = useStore((s) => s.progress);
  const books = useStore((s) => s.books);
  const app = useStore((s) => s.app);
  const setApp = useStore((s) => s.setApp);
  const [pickSource, setPickSource] = useState(false);
  const lvl = levelFromXp(progress.xp);
  const quests = dailyQuests(progress.days[dayKey()], app.dailyGoalMin);
  const source = books[app.trainingSource];
  const readable = useMemo(
    () => Object.values(books).filter((b) => b.format !== "cbz").sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt)),
    [books]
  );
  const [featured, ...rest] = GAMES;

  return (
    <div className="screen train">
      <header className="screen-header">
        <div>
          <div className="eyebrow">Gimnasio lector</div>
          <h1 className="screen-title">Entrenar</h1>
        </div>
      </header>

      <button className="level-card" onClick={() => navigate({ name: "progress" })}>
        <div className="level-emoji">{lvl.rank.emoji}</div>
        <div className="level-info">
          <div className="level-name">
            Nivel {lvl.level} · {lvl.rank.name}
          </div>
          <Bar value={lvl.progress} />
          <div className="level-xp">
            <Sparkles size={13} /> {lvl.xpIntoLevel} / {lvl.xpForNext} polvo de hadas
          </div>
        </div>
        <ChevronRight size={20} className="faint" />
      </button>

      <button className="source-card" onClick={() => setPickSource(true)}>
        <div className="source-cover">{source ? <Cover book={source} /> : <div className="source-classic">📜</div>}</div>
        <div className="source-text">
          <div className="eyebrow">Practicar con</div>
          <div className="source-title">{source ? source.title : "Textos clásicos"}</div>
          <div className="faint source-sub">{source ? "Desde donde vas leyendo" : "Cervantes, Lazarillo y relatos de Lectia"}</div>
        </div>
        <ChevronDown size={20} className="faint" />
      </button>

      <button className="game-hero" style={{ background: featured.gradient }} onClick={() => navigate({ name: "game", game: featured.id })}>
        <div className="game-hero-emoji">{featured.emoji}</div>
        <div className="game-hero-text">
          <div className="game-hero-title">{featured.title}</div>
          <div className="game-hero-sub">{featured.short}</div>
          <div className="game-hero-best">{featured.bestLabel(progress.bestRsvpWpm)}</div>
        </div>
        <ChevronRight size={22} />
      </button>

      <div className="game-grid">
        {rest.map((g) => (
          <button key={g.id} className="game-card" onClick={() => navigate({ name: "game", game: g.id })}>
            <div className="game-card-art" style={{ background: g.gradient }}>
              <span>{g.emoji}</span>
            </div>
            <div className="game-card-title">{g.title}</div>
            <div className="game-card-sub">{g.short}</div>
            <div className="game-card-best">{g.bestLabel(progress.games[g.id]?.best ?? 0)}</div>
          </button>
        ))}
      </div>

      <section className="section">
        <div className="section-title">Retos de hoy</div>
        <QuestList quests={quests} done={progress.days[dayKey()]?.quests ?? []} />
      </section>

      <Sheet open={pickSource} onClose={() => setPickSource(false)} title="Practicar con">
        <div className="list">
          <button
            className="list-item"
            onClick={() => {
              setApp({ trainingSource: "classics" });
              setPickSource(false);
            }}
          >
            <span className="li-icon emoji">📜</span>
            <span className="li-main">
              <div className="li-title">Textos clásicos</div>
              <div className="li-sub">Fragmentos de dominio público y relatos de Lectia</div>
            </span>
            {!source && <span className="accent-dot" />}
          </button>
          {readable.map((b) => (
            <button
              key={b.id}
              className="list-item"
              onClick={() => {
                setApp({ trainingSource: b.id });
                setPickSource(false);
              }}
            >
              <span className="li-cover">
                <Cover book={b} />
              </span>
              <span className="li-main">
                <div className="li-title ellipsis">{b.title}</div>
                <div className="li-sub">{b.author || "Autor desconocido"}</div>
              </span>
              {app.trainingSource === b.id && <span className="accent-dot" />}
            </button>
          ))}
        </div>
        {readable.length === 0 && (
          <p className="faint" style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <BookOpen size={16} /> Agrega libros a tu biblioteca para practicar con ellos.
          </p>
        )}
      </Sheet>
    </div>
  );
}

export function QuestList({ quests, done }: { quests: ReturnType<typeof dailyQuests>; done: string[] }) {
  return (
    <div className="quests">
      {quests.map((q) => {
        const complete = done.includes(q.id) || q.progress >= q.target;
        return (
          <div key={q.id} className={`quest ${complete ? "done" : ""}`}>
            <div className="quest-icon">{complete ? "✅" : q.icon}</div>
            <div className="quest-main">
              <div className="quest-title">{q.title}</div>
              <Bar value={q.progress / q.target} />
            </div>
            <div className="quest-xp">+{q.xp} ✨</div>
          </div>
        );
      })}
    </div>
  );
}
