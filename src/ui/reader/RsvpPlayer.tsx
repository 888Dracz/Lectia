// Reproductor de lectura rápida (RSVP): muestra las palabras una a una con la
// letra de enfoque resaltada. Se usa desde el lector y desde "Entrenar".
import { Minus, Pause, Play, Plus, RotateCcw, SkipBack, SkipForward, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chunkDuration, chunkWords, splitAtOrp } from "../../games/rsvp";
import { useBackClose } from "../../lib/router";
import { tokenizeWords } from "../../lib/text";
import { clamp } from "../../lib/util";

export interface RsvpBlock {
  text: string;
  /** Datos para volver a la posición en el libro al salir. */
  meta?: { chapter: number; offset?: number; fraction?: number; chapterLength?: number };
}

export interface RsvpResult {
  words: number;
  ms: number;
  wpm: number;
  /** Bloque y carácter alcanzados (para mover el marcador del libro). */
  blockIndex: number;
  charInBlock: number;
  finished: boolean;
}

interface Props {
  blocks: RsvpBlock[];
  title?: string;
  wpm: number;
  chunk: number;
  onSettings: (s: { wpm?: number; chunk?: number }) => void;
  onExit: (r: RsvpResult) => void;
}

interface Item {
  text: string;
  block: number;
  char: number;
  words: number;
}

export function RsvpPlayer({ blocks, title, wpm, chunk, onSettings, onExit }: Props) {
  const items = useMemo(() => {
    const out: Item[] = [];
    blocks.forEach((b, bi) => {
      const words = tokenizeWords(b.text);
      let char = 0;
      const positions = words.map((w) => {
        const i = b.text.indexOf(w, char);
        char = i >= 0 ? i + w.length : char;
        return i >= 0 ? i : char;
      });
      let wi = 0;
      for (const c of chunkWords(words, chunk)) {
        const count = tokenizeWords(c).length;
        out.push({ text: c, block: bi, char: positions[wi] ?? 0, words: count });
        wi += count;
      }
    });
    return out;
  }, [blocks, chunk]);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const stats = useRef({ words: 0, ms: 0, startedAt: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = useRef(0);
  idx.current = index;

  const stopTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const pause = useCallback(() => {
    stopTimer();
    if (stats.current.startedAt) {
      stats.current.ms += performance.now() - stats.current.startedAt;
      stats.current.startedAt = 0;
    }
    setPlaying(false);
  }, []);

  const tick = useCallback(() => {
    const i = idx.current;
    const item = items[i];
    if (!item) {
      pause();
      return;
    }
    stats.current.words += item.words;
    timer.current = setTimeout(() => {
      if (i + 1 >= items.length) {
        pause();
        setIndex(items.length);
        return;
      }
      setIndex(i + 1);
      idx.current = i + 1;
      tick();
    }, chunkDuration(item.text, wpm));
  }, [items, wpm, pause]);

  const play = useCallback(() => {
    if (idx.current >= items.length) {
      setIndex(0);
      idx.current = 0;
    }
    stopTimer();
    stats.current.startedAt = performance.now();
    setPlaying(true);
    tick();
  }, [items.length, tick]);

  // Cambiar la velocidad en marcha.
  useEffect(() => {
    if (playing) {
      stopTimer();
      tick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wpm]);

  useEffect(() => () => stopTimer(), []);

  const exit = () => {
    pause();
    const ms = stats.current.ms;
    const words = stats.current.words;
    const i = Math.min(idx.current, items.length - 1);
    const item = items[Math.max(0, i)];
    onExit({
      words,
      ms,
      wpm: ms > 3000 ? Math.round(words / (ms / 60000)) : wpm,
      blockIndex: item?.block ?? 0,
      charInBlock: item?.char ?? 0,
      finished: idx.current >= items.length,
    });
  };
  useBackClose(true, exit);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        if (playing) pause();
        else play();
      } else if (e.key === "ArrowUp") onSettings({ wpm: clamp(wpm + 25, 100, 1200) });
      else if (e.key === "ArrowDown") onSettings({ wpm: clamp(wpm - 25, 100, 1200) });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, pause, play, wpm, onSettings]);

  const seek = (delta: number) => {
    const wasPlaying = playing;
    pause();
    const ni = clamp(idx.current + delta, 0, Math.max(0, items.length - 1));
    setIndex(ni);
    idx.current = ni;
    if (wasPlaying) setTimeout(play, 50);
  };

  const done = index >= items.length;
  const item = items[Math.min(index, items.length - 1)];
  const progress = items.length ? Math.min(1, index / items.length) : 0;
  const remainingWords = items.slice(index).reduce((a, it) => a + it.words, 0);
  const remainingMin = Math.ceil(remainingWords / wpm);
  const context = item ? blocks[item.block]?.text : "";

  return (
    <div className="rsvp" role="dialog" aria-label="Lectura rápida">
      <div className="rsvp-top">
        <button className="icon-btn" onClick={exit} aria-label="Salir">
          <X size={22} />
        </button>
        <div className="rsvp-title">
          <div className="eyebrow">Lectura rápida</div>
          {title && <div className="rsvp-book">{title}</div>}
        </div>
        <button className={`btn btn-sm ${showContext ? "btn-primary" : "btn-outline"}`} onClick={() => setShowContext((v) => !v)}>
          Contexto
        </button>
      </div>

      <div
        className="rsvp-stage"
        onClick={() => {
          if (done) return;
          if (playing) pause();
          else play();
        }}
      >
        <div className="rsvp-guide top" />
        <div className="rsvp-word" aria-live="off">
          {done ? (
            <span className="rsvp-done">¡Terminaste! ✨</span>
          ) : item ? (
            item.words === 1 ? (
              <OrpWord word={item.text} />
            ) : (
              <span className="rsvp-chunk">{item.text}</span>
            )
          ) : (
            <span className="faint">Sin texto</span>
          )}
        </div>
        <div className="rsvp-guide bottom" />
        {!playing && !done && index === 0 && <div className="rsvp-hint">Toca para empezar</div>}
        {!playing && !done && index > 0 && <div className="rsvp-hint">En pausa · toca para seguir</div>}
      </div>

      {showContext && context && <div className="rsvp-context">{context}</div>}

      <div className="rsvp-bottom">
        <div className="rsvp-progress">
          <div className="bar">
            <i style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="rsvp-meta">
            <span>{Math.round(progress * 100)}%</span>
            <span>{done ? "Completado" : `≈ ${remainingMin} min restantes`}</span>
          </div>
        </div>
        <div className="rsvp-controls">
          <button className="icon-btn filled" onClick={() => seek(-10)} aria-label="Retroceder">
            <SkipBack size={20} />
          </button>
          {done ? (
            <button
              className="rsvp-play"
              onClick={() => {
                setIndex(0);
                idx.current = 0;
                play();
              }}
              aria-label="Repetir"
            >
              <RotateCcw size={28} />
            </button>
          ) : (
            <button className="rsvp-play" onClick={() => (playing ? pause() : play())} aria-label={playing ? "Pausa" : "Reproducir"}>
              {playing ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" style={{ marginLeft: 3 }} />}
            </button>
          )}
          <button className="icon-btn filled" onClick={() => seek(10)} aria-label="Adelantar">
            <SkipForward size={20} />
          </button>
        </div>
        <div className="rsvp-speed">
          <button className="icon-btn filled" onClick={() => onSettings({ wpm: clamp(wpm - 25, 100, 1200) })} aria-label="Más lento">
            <Minus size={18} />
          </button>
          <div className="rsvp-wpm">
            <b>{wpm}</b>
            <span>palabras/min</span>
          </div>
          <button className="icon-btn filled" onClick={() => onSettings({ wpm: clamp(wpm + 25, 100, 1200) })} aria-label="Más rápido">
            <Plus size={18} />
          </button>
        </div>
        <div className="segmented rsvp-chunks">
          {[1, 2, 3].map((c) => (
            <button key={c} className={chunk === c ? "active" : ""} onClick={() => onSettings({ chunk: c })}>
              {c === 1 ? "1 palabra" : `${c} palabras`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OrpWord({ word }: { word: string }) {
  const [a, b, c] = splitAtOrp(word);
  return (
    <span className="orp">
      <span className="orp-left">{a}</span>
      <span className="orp-focus">{b}</span>
      <span className="orp-right">{c}</span>
    </span>
  );
}
