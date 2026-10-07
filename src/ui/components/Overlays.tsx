import { CircleCheck, CircleAlert, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { useUi } from "../../store/ui";

export function Toasts({ high }: { high?: boolean }) {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div className={`toasts ${high ? "high" : ""}`} aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone ?? ""}`} onClick={() => dismiss(t.id)}>
          <span className="toast-icon">
            {t.icon ? (
              <span aria-hidden>{t.icon}</span>
            ) : t.tone === "success" ? (
              <CircleCheck size={18} />
            ) : t.tone === "error" ? (
              <CircleAlert size={18} color="#ff8f8f" />
            ) : t.tone === "xp" ? (
              <Sparkles size={18} />
            ) : null}
          </span>
          <span>{t.text}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={(e) => {
                e.stopPropagation();
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Lluvia de destellos dorados ("polvo de hadas"). */
export function SparkleBurst({ count = 90 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    const colors = ["#ffd98a", "#f2b544", "#ffffff", "#c3b9ff", "#ffb3c8"];
    const parts = Array.from({ length: count }, () => {
      const ang = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 7;
      return {
        x: W / 2,
        y: H * 0.42,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - 3,
        r: 2 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        star: Math.random() < 0.55,
      };
    });
    let raf = 0;
    const star = (x: number, y: number, r: number, rot: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(0, -r * 2.2);
        ctx.quadraticCurveTo(0, 0, r * 2.2, 0);
        ctx.rotate(Math.PI / 2);
      }
      ctx.fill();
      ctx.restore();
    };
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      let alive = false;
      for (const p of parts) {
        if (p.life <= 0) continue;
        alive = true;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12;
        p.vx *= 0.985;
        p.rot += p.vr;
        p.life -= 0.009;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        if (p.star) star(p.x, p.y, p.r, p.rot);
        else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (alive) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [count]);
  return <canvas ref={ref} className="sparkle-canvas" />;
}

export function Celebrations() {
  const current = useUi((s) => s.celebrations[0]);
  const shift = useUi((s) => s.shiftCelebration);
  useEffect(() => {
    if (!current) return;
    navigator.vibrate?.([30, 40, 60]);
  }, [current]);
  if (!current) return null;
  return (
    <div className="celebrate-wrap" onClick={shift}>
      <div className="backdrop" />
      <SparkleBurst key={current.id} />
      <div className="celebrate" onClick={(e) => e.stopPropagation()}>
        <div className="medal">{current.icon}</div>
        <div className="kicker">{current.kind === "level" ? "Subiste de nivel" : current.kind === "league" ? "Liga semanal" : "Logro desbloqueado"}</div>
        <h2>{current.title}</h2>
        <p>{current.subtitle}</p>
        <button className="btn btn-primary btn-block" onClick={shift}>
          ¡Genial!
        </button>
      </div>
    </div>
  );
}

export function BusyOverlay() {
  const busy = useUi((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="busy">
      <div className="busy-card">
        <div className="spinner" />
        <span>{busy}</span>
      </div>
    </div>
  );
}
