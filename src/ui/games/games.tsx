// Los minijuegos. Cada uno recibe el texto de entrenamiento y avisa al
// terminar con su puntuación y la experiencia ganada.
import { Check, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  makeCloze,
  makeFlash,
  makeSchulte,
  makeScramble,
  makeWordPresence,
  scrambleCorrect,
  takePassage,
} from "../../games/generators";
import { classicsText } from "../../games/sources";
import { countWords, fold } from "../../lib/text";
import { clamp } from "../../lib/util";
import { useStore } from "../../store/store";
import type { GameResult } from "./GameScreen";

type Finish = (r: GameResult) => void;

function NotEnough() {
  return (
    <div className="game-empty">
      <p>Este texto es muy corto para el juego. Prueba con otro libro o con los textos clásicos desde Entrenar → “Practicar con”.</p>
    </div>
  );
}

function RoundHeader({ index, total, score, extra }: { index: number; total: number; score: number; extra?: string }) {
  return (
    <div className="round-head">
      <div className="round-dots">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < index ? "done" : i === index ? "now" : ""} />
        ))}
      </div>
      <div className="round-score">
        {extra && <span className="faint">{extra}</span>}
        <b>{score}</b> pts
      </div>
    </div>
  );
}

function useFeedback() {
  const [fb, setFb] = useState<null | "ok" | "bad">(null);
  const show = (ok: boolean) => {
    setFb(ok ? "ok" : "bad");
    navigator.vibrate?.(ok ? 12 : [30, 40, 30]);
  };
  return { fb, show, clear: () => setFb(null) };
}

// ---------------------------------------------------------------------------
// Test de velocidad
// ---------------------------------------------------------------------------
export function SpeedTestGame({ text, onFinish }: { text: string; onFinish: Finish }) {
  const passage = useMemo(() => takePassage(text, 230), [text]);
  const words = countWords(passage);
  const questions = useMemo(() => makeWordPresence(passage, text.length > 4000 ? text : text + "\n" + classicsText(), Math.random, 3), [passage, text]);
  const [phase, setPhase] = useState<"read" | "quiz">("read");
  const [start] = useState(() => performance.now());
  const [wpm, setWpm] = useState(0);
  const [qi, setQi] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  if (words < 60) return <NotEnough />;

  if (phase === "read") {
    return (
      <div className="speed-read">
        <p className="faint speed-tip">Lee a tu ritmo normal, entendiendo. Al terminar, toca el botón.</p>
        <div className="speed-passage">{passage}</div>
        <button
          className="btn btn-primary btn-block speed-done"
          onClick={() => {
            const min = (performance.now() - start) / 60000;
            const measured = Math.round(words / Math.max(min, 0.05));
            if (measured > 1500) {
              onFinish({
                score: 0,
                xp: 0,
                headline: "¿Lo leíste todo?",
                details: [`Eso serían ${measured} palabras por minuto: demasiado rápido para entender el texto.`, "Vuelve a intentarlo leyendo a tu ritmo normal."],
              });
              return;
            }
            if (!questions.length) {
              useStore.getState().logWpmTest({ wpm: measured, comprehension: 1 });
              onFinish({ score: measured, xp: 15, headline: `${measured} palabras por minuto`, details: [] });
              return;
            }
            setWpm(measured);
            setPhase("quiz");
          }}
        >
          Terminé de leer
        </button>
      </div>
    );
  }

  const q = questions[qi];
  const answer = (opt: string) => {
    if (picked) return;
    setPicked(opt);
    const ok = opt === q.answer;
    if (ok) setCorrect((c) => c + 1);
    setTimeout(() => {
      setPicked(null);
      if (qi + 1 < questions.length) setQi(qi + 1);
      else {
        const total = correct + (ok ? 1 : 0);
        const comprehension = questions.length ? total / questions.length : 1;
        const effective = Math.round(wpm * comprehension);
        useStore.getState().logWpmTest({ wpm, comprehension });
        onFinish({
          score: effective,
          xp: 15 + total * 5,
          headline: `${wpm} palabras por minuto`,
          details: [
            `Comprensión: ${Math.round(comprehension * 100)}% (${total} de ${questions.length})`,
            `Velocidad efectiva: ${effective} ppm`,
            wpm < 180 ? "Ritmo pausado: ideal para estudiar. Practica la lectura rápida para subirlo." : wpm < 300 ? "¡Buen ritmo! Estás en el promedio de una persona lectora adulta." : "¡Excelente! Lees más rápido que la mayoría.",
          ],
        });
      }
    }, 700);
  };

  if (!q) return null;

  return (
    <div className="quiz">
      <RoundHeader index={qi} total={questions.length} score={correct} extra={`${wpm} ppm ·`} />
      <h3 className="quiz-q">¿Cuál de estas palabras aparecía en el texto?</h3>
      <div className="options">
        {q.options.map((o) => (
          <button
            key={o}
            className={`option ${picked ? (o === q.answer ? "right" : o === picked ? "wrong" : "dim") : ""}`}
            onClick={() => answer(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Palabra perdida
// ---------------------------------------------------------------------------
export function ClozeGame({ text, onFinish }: { text: string; onFinish: Finish }) {
  const questions = useMemo(() => makeCloze(text, Math.random, 10), [text]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(() => performance.now());
  const { fb, show, clear } = useFeedback();

  if (questions.length < 3) return <NotEnough />;
  const q = questions[i];

  const answer = (opt: string) => {
    if (picked) return;
    setPicked(opt);
    const ok = fold(opt) === fold(q.answer);
    const secs = (performance.now() - startedAt) / 1000;
    const gained = ok ? 100 + Math.max(0, Math.round(50 - secs * 5)) : 0;
    show(ok);
    if (ok) {
      setScore((s) => s + gained);
      setHits((h) => h + 1);
    }
    setTimeout(() => {
      clear();
      setPicked(null);
      if (i + 1 < questions.length) {
        setI(i + 1);
        setStartedAt(performance.now());
      } else {
        const finalHits = hits + (ok ? 1 : 0);
        const finalScore = score + gained;
        onFinish({
          score: finalScore,
          xp: 5 + finalHits * 3,
          headline: `${finalHits} de ${questions.length} correctas`,
          details: [finalHits === questions.length ? "¡Perfecto! 🌟" : "Cuanto más rápido respondes, más puntos ganas."],
        });
      }
    }, ok ? 650 : 1300);
  };

  return (
    <div className={`quiz ${fb ?? ""}`}>
      <RoundHeader index={i} total={questions.length} score={score} />
      <div className="cloze-sentence">
        {q.before}{" "}
        <span className={`cloze-gap ${picked ? (fold(picked) === fold(q.answer) ? "right" : "wrong") : ""}`}>{picked ? q.answer : "______"}</span>{" "}
        {q.after}
      </div>
      <div className="options">
        {q.options.map((o) => (
          <button
            key={o}
            className={`option ${picked ? (fold(o) === fold(q.answer) ? "right" : o === picked ? "wrong" : "dim") : ""}`}
            onClick={() => answer(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ordena la frase
// ---------------------------------------------------------------------------
export function ScrambleGame({ text, onFinish }: { text: string; onFinish: Finish }) {
  const questions = useMemo(() => makeScramble(text, Math.random, 6), [text]);
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [state, setState] = useState<"play" | "ok" | "bad">("play");
  const [startedAt, setStartedAt] = useState(() => performance.now());
  const [tries, setTries] = useState(0);

  if (questions.length < 2) return <NotEnough />;
  const q = questions[i];

  const nextRound = (ok: boolean, gained: number) => {
    setTimeout(() => {
      setState("play");
      setChosen([]);
      setTries(0);
      if (i + 1 < questions.length) {
        setI(i + 1);
        setStartedAt(performance.now());
      } else {
        const finalHits = hits + (ok ? 1 : 0);
        onFinish({
          score: score + gained,
          xp: 5 + finalHits * 4,
          headline: `${finalHits} de ${questions.length} frases`,
          details: ["Leer por grupos de palabras con sentido te ayuda a comprender más rápido."],
        });
      }
    }, ok ? 900 : 2200);
  };

  const pick = (id: number) => {
    if (state !== "play" || chosen.includes(id)) return;
    const next = [...chosen, id];
    setChosen(next);
    if (next.length === q.words.length) {
      const ok = scrambleCorrect(q, next);
      if (ok) {
        const secs = (performance.now() - startedAt) / 1000;
        const gained = Math.max(40, 150 - Math.round(secs * 4) - tries * 30);
        setScore((s) => s + gained);
        setHits((h) => h + 1);
        setState("ok");
        navigator.vibrate?.(12);
        nextRound(true, gained);
      } else if (tries < 1) {
        setState("bad");
        navigator.vibrate?.([30, 40, 30]);
        setTimeout(() => {
          setState("play");
          setChosen([]);
          setTries((t) => t + 1);
        }, 900);
      } else {
        setState("bad");
        nextRound(false, 0);
      }
    }
  };

  return (
    <div className={`quiz ${state === "ok" ? "ok" : state === "bad" ? "bad" : ""}`}>
      <RoundHeader index={i} total={questions.length} score={score} />
      <div className="scramble-answer">
        {chosen.length === 0 && <span className="faint">Toca las palabras en orden…</span>}
        {chosen.map((id, k) => (
          <button key={k} className="word-chip placed" onClick={() => state === "play" && setChosen(chosen.slice(0, k))}>
            {q.words[id]}
          </button>
        ))}
      </div>
      {state === "bad" && tries >= 1 && <div className="scramble-solution">{q.sentence}</div>}
      <div className="scramble-pool">
        {q.shuffled.map((w) => (
          <button key={w.id} className={`word-chip ${chosen.includes(w.id) ? "used" : ""}`} onClick={() => pick(w.id)}>
            {w.word}
          </button>
        ))}
      </div>
      <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => state === "play" && setChosen([])}>
          <RotateCcw size={16} /> Reiniciar
        </button>
        {state === "ok" && (
          <span className="pill-ok">
            <Check size={16} /> ¡Bien!
          </span>
        )}
        {state === "bad" && (
          <span className="pill-bad">
            <X size={16} /> {tries >= 1 ? "Era así" : "Inténtalo otra vez"}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Destello
// ---------------------------------------------------------------------------
export function FlashGame({ text, onFinish }: { text: string; onFinish: Finish }) {
  const questions = useMemo(() => makeFlash(text, Math.random, 10, 2, 4), [text]);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<"ready" | "show" | "answer">("ready");
  const [duration, setDuration] = useState(450);
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const best = useRef(450);

  useEffect(() => {
    if (phase === "ready") {
      const t = setTimeout(() => setPhase("show"), 900);
      return () => clearTimeout(t);
    }
    if (phase === "show") {
      const t = setTimeout(() => setPhase("answer"), duration);
      return () => clearTimeout(t);
    }
  }, [phase, duration]);

  if (questions.length < 4) return <NotEnough />;
  const q = questions[i];

  const answer = (opt: string) => {
    if (picked) return;
    setPicked(opt);
    const ok = opt === q.phrase;
    const gained = ok ? Math.round(60 + (600 - duration) / 4) : 0;
    if (ok) {
      setScore((s) => s + gained);
      setHits((h) => h + 1);
      best.current = Math.min(best.current, duration);
    }
    navigator.vibrate?.(ok ? 12 : [30, 40, 30]);
    const nextDuration = clamp(Math.round(ok ? duration * 0.85 : duration * 1.2), 60, 1200);
    setTimeout(() => {
      setPicked(null);
      setDuration(nextDuration);
      if (i + 1 < questions.length) {
        setI(i + 1);
        setPhase("ready");
      } else {
        const finalHits = hits + (ok ? 1 : 0);
        onFinish({
          score: score + gained,
          xp: 5 + finalHits * 3,
          headline: `${finalHits} de ${questions.length} destellos`,
          details: [`Frase más rápida reconocida: ${best.current} ms`, "Este ejercicio amplía cuántas palabras captas en una sola mirada."],
        });
      }
    }, ok ? 600 : 1300);
  };

  return (
    <div className="quiz">
      <RoundHeader index={i} total={questions.length} score={score} extra={`${duration} ms ·`} />
      <div className="flash-stage">
        {phase === "ready" && <div className="flash-fix">+</div>}
        {phase === "show" && <div className="flash-phrase">{q.phrase}</div>}
        {phase === "answer" && <div className="flash-q">¿Qué frase viste?</div>}
      </div>
      {phase === "answer" && (
        <div className="options">
          {q.options.map((o) => (
            <button
              key={o}
              className={`option ${picked ? (o === q.phrase ? "right" : o === picked ? "wrong" : "dim") : ""}`}
              onClick={() => answer(o)}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabla de Schulte
// ---------------------------------------------------------------------------
export function SchulteGame({ onFinish }: { onFinish: Finish }) {
  const size = 5;
  const [grid] = useState(() => makeSchulte(size));
  const [nextNum, setNextNum] = useState(1);
  const [errors, setErrors] = useState(0);
  const [wrong, setWrong] = useState<number | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (start === null) return;
    const t = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(t);
  }, [start]);

  const tapCell = (n: number) => {
    const t0 = start ?? performance.now();
    if (start === null) setStart(t0);
    if (n === nextNum) {
      navigator.vibrate?.(8);
      if (n === size * size) {
        const secs = (performance.now() - t0) / 1000;
        const score = Math.max(0, Math.round(1000 - secs * 10 - errors * 20));
        onFinish({
          score,
          xp: clamp(Math.round(45 - secs), 8, 40),
          headline: `${secs.toFixed(1)} segundos`,
          details: [
            `Errores: ${errors}`,
            secs < 25 ? "¡Visión de halcón! 🦅" : secs < 40 ? "¡Muy bien! Intenta no mover los ojos del centro." : "Con práctica diaria bajarás de 30 segundos.",
          ],
        });
      }
      setNextNum(n + 1);
    } else {
      setErrors((e) => e + 1);
      setWrong(n);
      navigator.vibrate?.([20, 30, 20]);
      setTimeout(() => setWrong(null), 300);
    }
  };

  const elapsed = start === null ? 0 : (now - start) / 1000;

  return (
    <div className="schulte">
      <div className="schulte-head">
        <div>
          Busca el <b className="schulte-next">{Math.min(nextNum, size * size)}</b>
        </div>
        <div className="schulte-time">{Math.max(0, elapsed).toFixed(1)} s</div>
      </div>
      <div className="schulte-grid" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {grid.map((n) => (
          <button
            key={n}
            className={`schulte-cell ${n < nextNum ? "found" : ""} ${wrong === n ? "wrong" : ""}`}
            onClick={() => tapCell(n)}
          >
            {n}
          </button>
        ))}
        <span className="schulte-center" aria-hidden />
      </div>
      <p className="faint schulte-tip">Fija la mirada en el punto central y encuentra los números con la visión periférica.</p>
    </div>
  );
}
