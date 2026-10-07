import { Flame, Star } from "lucide-react";
import { useId, type ReactNode } from "react";
import { colorValue } from "../../community/catalog";
import { division } from "../../community/divisions";
import { liveStreak } from "../../community/streaks";
import type { Liker, UserSummary } from "../../community/types";

export function Avatar({ user, size = 44, className }: { user: Pick<UserSummary, "avatar" | "color">; size?: number; className?: string }) {
  return (
    <span
      className={`avatar ${className ?? ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.52), ["--av" as string]: colorValue(user.color) }}
      aria-hidden
    >
      {user.avatar}
    </span>
  );
}

/** Escudo de una división de la liga. */
export function DivisionBadge({ div, size = 56, locked = false }: { div: number; size?: number; locked?: boolean }) {
  const d = division(div);
  const id = `dv${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      viewBox="0 0 64 72"
      width={size}
      height={(size * 72) / 64}
      className={`div-badge ${locked ? "locked" : ""}`}
      role="img"
      aria-label={`División ${d.name}${locked ? " (bloqueada)" : ""}`}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={d.light} />
          <stop offset="1" stopColor={d.color} />
        </linearGradient>
      </defs>
      <path d="M32 3 L58 13 V36 C58 52 46 63 32 69 C18 63 6 52 6 36 V13 Z" fill={`url(#${id})`} stroke="rgba(0,0,0,.2)" strokeWidth="2" />
      <path d="M32 9 L52 17 V36 C52 48 43 57 32 62 C21 57 12 48 12 36 V17 Z" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2" />
      <path d="M21 31 L27 23 H37 L43 31 L32 47 Z" fill="rgba(255,255,255,.88)" />
      <path d="M21 31 H43 M27 23 L32 31 L37 23 M32 31 V47" stroke={d.color} strokeWidth="1.6" fill="none" opacity=".55" />
    </svg>
  );
}

/** Racha de otra persona (llama encendida si ya leyó hoy). */
export function StreakChip({ user, className }: { user: Pick<UserSummary, "streak" | "last_active_day" | "tz">; className?: string }) {
  const s = liveStreak(user);
  return (
    <span className={`streak-chip ${s.today ? "on" : ""} ${className ?? ""}`} title={s.days ? `Racha de ${s.days} días` : "Sin racha"}>
      <Flame size={13} />
      {s.days}
    </span>
  );
}

export function Stars({ value, onChange, size = 18 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span className="stars" role={onChange ? "radiogroup" : "img"} aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} estrellas`} onClick={() => onChange(value === n ? 0 : n)}>
            <Star size={size} fill={n <= value ? "currentColor" : "none"} />
          </button>
        ) : (
          <Star key={n} size={size} fill={n <= value ? "currentColor" : "none"} className={n <= value ? "" : "off"} />
        )
      )}
    </span>
  );
}

export function LikersLine({ likers, likes, liked }: { likers: Liker[]; likes: number; liked: boolean }) {
  if (likes <= 0) return null;
  const rest = likes - 1;
  const first = likers[0]?.display_name.split(" ")[0] ?? "alguien";
  const text = liked
    ? rest > 0
      ? `A ti y a ${rest} más les gusta`
      : "Te gusta"
    : rest > 0
      ? `A ${first} y a ${rest} más les gusta`
      : `A ${first} le gusta`;
  return (
    <span className="likers">
      <span className="likers-faces">
        {likers.slice(0, 3).map((l) => (
          <Avatar key={l.username} user={l} size={20} />
        ))}
      </span>
      <span>{text}</span>
    </span>
  );
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="cm-loading">
      <div className="spinner" />
      <span className="faint">{label}</span>
    </div>
  );
}

export function EmptyNote({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="cm-empty">
      <div className="cm-empty-emoji">{emoji}</div>
      <b>{title}</b>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

export function ErrorRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="cm-empty">
      <div className="cm-empty-emoji">📡</div>
      <b>No se pudo cargar</b>
      <p className="muted">Revisa tu conexión a internet.</p>
      <button className="btn btn-sm" onClick={onRetry} style={{ marginTop: 10 }}>
        Reintentar
      </button>
    </div>
  );
}

/** Enlace para invitar a alguien a tu perfil. */
export function profileLink(username: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/perfil/${encodeURIComponent(username)}`;
}

export async function shareProfile(username: string, toastFn: (t: string) => void) {
  const url = profileLink(username);
  const text = `¡Lee conmigo en Lectia! Agrégame como amigo: @${username}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Lectia", text, url });
      return;
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toastFn("Enlace copiado");
  } catch {
    toastFn(url);
  }
}
