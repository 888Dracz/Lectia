import { ArrowLeft } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { trainingText } from "../../games/sources";
import { goBack } from "../../lib/router";
import { formatNumber } from "../../lib/util";
import type { GameId } from "../../store/state";
import { useStore } from "../../store/store";
import { SparkleBurst } from "../components/Overlays";
import { RsvpPlayer, type RsvpResult } from "../reader/RsvpPlayer";
import { gameInfo } from "./catalog";
import { ClozeGame, FlashGame, SchulteGame, ScrambleGame, SpeedTestGame } from "./games";

export interface GameResult {
  score: number;
  xp: number;
  headline: string;
  details: string[];
}

export function GameScreen({ game }: { game: string }) {
  const info = gameInfo(game);
  const books = useStore((s) => s.books);
  const source = useStore((s) => s.app.trainingSource);
  const [text, setText] = useState<{ text: string; label: string } | null>(null);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);

  useEffect(() => {
    let alive = true;
    void trainingText(source, books).then((t) => alive && setText(t));
    return () => {
      alive = false;
    };
    // Solo al entrar o al cambiar de fuente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  if (!info) {
    return (
      <div className="screen">
        <p>Juego no encontrado.</p>
      </div>
    );
  }

  const finish = (r: GameResult) => {
    const prevBest = useStore.getState().progress.games[info.id]?.best ?? 0;
    useStore.getState().logGame(info.id as GameId, r.score, r.xp);
    setResult({ ...r, details: r.score > prevBest && prevBest > 0 ? ["¡Nuevo récord personal! 🏆", ...r.details] : r.details });
  };

  if (info.id === "rsvp") {
    if (!text) return <GameLoading />;
    const blocks = text.text
      .split(/\n+/)
      .filter((p) => p.trim())
      .map((p) => ({ text: p }));
    return (
      <RsvpTraining
        key={round}
        blocks={blocks}
        label={text.label}
        onDone={(r) => {
          if (r.words > 0) {
            useStore.getState().logRsvp(r.words, r.wpm, r.ms);
            useStore.getState().logGame("rsvp", r.wpm, 0);
          }
          goBack({ name: "train" });
        }}
      />
    );
  }

  return (
    <div className="game-screen" style={{ ["--game-grad" as string]: info.gradient }}>
      <header className="game-head">
        <button className="icon-btn" onClick={() => goBack({ name: "train" })} aria-label="Volver">
          <ArrowLeft size={22} />
        </button>
        <div className="game-head-title">
          <span>{info.emoji}</span> {info.title}
        </div>
        <span style={{ width: 42 }} />
      </header>
      <div className="game-body" key={round}>
        {!text ? (
          <GameLoading />
        ) : result ? (
          <ResultView
            result={result}
            onAgain={() => {
              setResult(null);
              setRound((r) => r + 1);
            }}
          />
        ) : (
          <GameIntroOrPlay info={info} label={text.label}>
            {info.id === "speedtest" && <SpeedTestGame text={text.text} onFinish={finish} />}
            {info.id === "cloze" && <ClozeGame text={text.text} onFinish={finish} />}
            {info.id === "scramble" && <ScrambleGame text={text.text} onFinish={finish} />}
            {info.id === "flash" && <FlashGame text={text.text} onFinish={finish} />}
            {info.id === "schulte" && <SchulteGame onFinish={finish} />}
          </GameIntroOrPlay>
        )}
      </div>
    </div>
  );
}

function GameLoading() {
  return (
    <div className="game-loading">
      <div className="spinner" />
      <p className="muted">Preparando el texto…</p>
    </div>
  );
}

function GameIntroOrPlay({ info, label, children }: { info: NonNullable<ReturnType<typeof gameInfo>>; label: string; children: ReactNode }) {
  const [started, setStarted] = useState(false);
  if (started) return <>{children}</>;
  return (
    <div className="game-intro">
      <div className="game-intro-art" style={{ background: info.gradient }}>
        {info.emoji}
      </div>
      <h2 className="display">{info.title}</h2>
      <p className="muted">{info.description}</p>
      {info.id !== "schulte" && <p className="faint game-source">Texto: {label}</p>}
      <button className="btn btn-primary btn-block" onClick={() => setStarted(true)}>
        Empezar
      </button>
    </div>
  );
}

function ResultView({ result, onAgain }: { result: GameResult; onAgain: () => void }) {
  return (
    <div className="game-result">
      <SparkleBurst count={60} />
      <div className="result-medal">🏅</div>
      <h2 className="display">{result.headline}</h2>
      <div className="result-score">
        <b>{formatNumber(result.score)}</b>
        <span>puntos</span>
      </div>
      <ul className="result-details">
        {result.details.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
      <div className="result-xp">+{result.xp} ✨ polvo de hadas</div>
      <button className="btn btn-primary btn-block" onClick={onAgain}>
        Jugar de nuevo
      </button>
      <button className="btn btn-ghost btn-block" onClick={() => goBack({ name: "train" })}>
        Volver a Entrenar
      </button>
    </div>
  );
}

function RsvpTraining({ blocks, label, onDone }: { blocks: { text: string }[]; label: string; onDone: (r: RsvpResult) => void }) {
  const reader = useStore((s) => s.reader);
  const setReader = useStore((s) => s.setReader);
  return (
    <RsvpPlayer
      blocks={blocks}
      title={label}
      wpm={reader.rsvpWpm}
      chunk={reader.rsvpChunk}
      onSettings={(s) => setReader({ ...(s.wpm ? { rsvpWpm: s.wpm } : {}), ...(s.chunk ? { rsvpChunk: s.chunk } : {}) })}
      onExit={onDone}
    />
  );
}
