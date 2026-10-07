import { ArrowLeft, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { AVATARS, COLORS, GENRES, MAX_GENRES, MOMENTS, suggestUsername, USERNAME_RE } from "../../community/catalog";
import { reportError, saveProfile } from "../../community/store";
import type { Profile, ProfileInput } from "../../community/types";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { Range, Switch } from "../components/controls";
import { Sheet } from "../components/Sheet";
import { Avatar } from "./parts";

const EMPTY: ProfileInput = {
  username: "",
  display_name: "",
  avatar: "📚",
  color: "gold",
  bio: "",
  genres: [],
  favorite_book: "",
  favorite_authors: "",
  reading_moment: "",
  yearly_goal: 12,
};

function fromProfile(p: Profile | null): ProfileInput {
  if (!p) return { ...EMPTY, avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)] };
  return {
    username: p.username,
    display_name: p.display_name,
    avatar: p.avatar,
    color: p.color,
    bio: p.bio,
    genres: p.genres,
    favorite_book: p.favorite_book,
    favorite_authors: p.favorite_authors,
    reading_moment: p.reading_moment,
    yearly_goal: p.yearly_goal,
  };
}

const STEPS = ["Tú", "Tus gustos", "Un poco más"];

/** Crear (en tres pasos) o editar el perfil de la comunidad. */
export function ProfileEditor({ open, profile, onClose, onSaved }: { open: boolean; profile: Profile | null; onClose: () => void; onSaved?: (p: Profile) => void }) {
  const creating = !profile;
  const [form, setForm] = useState<ProfileInput>(() => fromProfile(profile));
  const [step, setStep] = useState(0);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const community = useStore((s) => s.community);
  const setCommunity = useStore((s) => s.setCommunity);

  useEffect(() => {
    if (open) {
      setForm(fromProfile(profile));
      setStep(0);
      setUsernameTouched(!!profile);
    }
  }, [open, profile]);

  const patch = (p: Partial<ProfileInput>) => setForm((f) => ({ ...f, ...p }));
  const nameOk = form.display_name.trim().length > 0;
  const userOk = USERNAME_RE.test(form.username);

  const submit = async () => {
    if (!nameOk || !userOk) {
      setStep(0);
      toast(nameOk ? "Revisa tu nombre de usuario" : "Escribe tu nombre", { tone: "error" });
      return;
    }
    setSaving(true);
    try {
      const saved = await saveProfile(form);
      toast(creating ? "¡Bienvenida/o a la comunidad!" : "Perfil guardado", { tone: "success", icon: creating ? "🎉" : undefined });
      onSaved?.(saved);
      onClose();
    } catch (e) {
      reportError(e);
    } finally {
      setSaving(false);
    }
  };

  const sections = {
    you: (
      <>
        <div className="pe-preview">
          <Avatar user={form} size={88} />
        </div>
        <div className="label">Avatar</div>
        <div className="pe-avatars">
          {AVATARS.map((a) => (
            <button key={a} type="button" className={`pe-avatar ${form.avatar === a ? "active" : ""}`} onClick={() => patch({ avatar: a })} aria-label={`Avatar ${a}`}>
              {a}
            </button>
          ))}
        </div>
        <div className="label">Color</div>
        <div className="accent-picker pe-colors">
          {COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`accent-swatch ${form.color === c.id ? "active" : ""}`}
              style={{ background: c.value }}
              aria-label={c.name}
              onClick={() => patch({ color: c.id })}
            />
          ))}
        </div>
        <label className="label" htmlFor="pe-name">
          Tu nombre
        </label>
        <input
          id="pe-name"
          className="field"
          value={form.display_name}
          maxLength={40}
          placeholder="Cómo quieres que te vean"
          onChange={(e) => {
            const display_name = e.target.value;
            patch(usernameTouched ? { display_name } : { display_name, username: display_name.trim() ? suggestUsername(display_name) : "" });
          }}
        />
        <label className="label" htmlFor="pe-user">
          Nombre de usuario
        </label>
        <div className="pe-username">
          <span>@</span>
          <input
            id="pe-user"
            className="field"
            value={form.username}
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="tu_usuario"
            onChange={(e) => {
              setUsernameTouched(true);
              patch({ username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "") });
            }}
          />
        </div>
        <p className={`pe-hint ${form.username && !userOk ? "bad" : ""}`}>
          {form.username && !userOk ? "De 3 a 20 letras, números, puntos o guiones bajos." : "Tus amigos te encontrarán con este nombre."}
        </p>
      </>
    ),
    tastes: (
      <>
        <p className="muted pe-lead">¿Qué te gusta leer? Elige hasta {MAX_GENRES} géneros.</p>
        <div className="pe-genres">
          {GENRES.map((g) => {
            const on = form.genres.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                className={`chip ${on ? "active" : ""}`}
                onClick={() => {
                  if (on) patch({ genres: form.genres.filter((x) => x !== g.id) });
                  else if (form.genres.length < MAX_GENRES) patch({ genres: [...form.genres, g.id] });
                  else toast(`Puedes elegir hasta ${MAX_GENRES} géneros`);
                }}
              >
                {g.emoji} {g.id}
              </button>
            );
          })}
        </div>
      </>
    ),
    more: (
      <>
        <label className="label" htmlFor="pe-bio">
          Sobre ti
        </label>
        <textarea
          id="pe-bio"
          className="field pe-bio"
          value={form.bio}
          maxLength={160}
          placeholder="Una frase que te describa como lector/a"
          onChange={(e) => patch({ bio: e.target.value })}
        />
        <div className="pe-count faint">{form.bio.length}/160</div>
        <label className="label" htmlFor="pe-book">
          Libro favorito
        </label>
        <input id="pe-book" className="field" value={form.favorite_book} maxLength={120} placeholder="El que siempre recomiendas" onChange={(e) => patch({ favorite_book: e.target.value })} />
        <label className="label" htmlFor="pe-authors">
          Autores favoritos
        </label>
        <input
          id="pe-authors"
          className="field"
          value={form.favorite_authors}
          maxLength={160}
          placeholder="Separados por comas"
          onChange={(e) => patch({ favorite_authors: e.target.value })}
        />
        <div className="label">¿Cuándo lees más?</div>
        <div className="pe-moments">
          {MOMENTS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`chip ${form.reading_moment === m.id ? "active" : ""}`}
              onClick={() => patch({ reading_moment: form.reading_moment === m.id ? "" : m.id })}
            >
              {m.emoji} {m.label}
            </button>
          ))}
        </div>
        <div className="label pe-goal-label">
          <span>Meta de libros este año</span>
          <b>{form.yearly_goal === 0 ? "Sin meta" : form.yearly_goal}</b>
        </div>
        <Range value={form.yearly_goal} min={0} max={100} onChange={(v) => patch({ yearly_goal: v })} label="Meta de libros al año" />
        {creating && (
          <div className="list pe-privacy">
            <div className="list-item">
              <span className="li-main">
                <div className="li-title">Compartir los libros que termino</div>
                <div className="li-sub">Aparecen en las Novedades de tus amigos</div>
              </span>
              <Switch on={community.autoShareBooks} onChange={(v) => setCommunity({ autoShareBooks: v })} />
            </div>
            <div className="list-item">
              <span className="li-main">
                <div className="li-title">Compartir logros y rachas</div>
                <div className="li-sub">Rachas, niveles, logros y ascensos de liga</div>
              </span>
              <Switch on={community.autoShareMilestones} onChange={(v) => setCommunity({ autoShareMilestones: v })} />
            </div>
          </div>
        )}
      </>
    ),
  };

  const order = [sections.you, sections.tastes, sections.more];

  return (
    <Sheet open={open} onClose={onClose} height="92dvh" title={creating ? "Crea tu perfil" : "Editar perfil"} className="pe-sheet">
      {creating ? (
        <>
          <div className="pe-steps" aria-label={`Paso ${step + 1} de ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <span key={s} className={i <= step ? "on" : ""}>
                <i />
                {s}
              </span>
            ))}
          </div>
          {order[step]}
          <div className="pe-actions">
            {step > 0 && (
              <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={18} /> Atrás
              </button>
            )}
            <span className="spacer" />
            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary" disabled={step === 0 && (!nameOk || !userOk)} onClick={() => setStep(step + 1)}>
                Siguiente
              </button>
            ) : (
              <button className="btn btn-primary" disabled={saving} onClick={() => void submit()}>
                <Check size={18} /> {saving ? "Creando…" : "Crear perfil"}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          {sections.you}
          <div className="label">Géneros favoritos</div>
          {sections.tastes}
          {sections.more}
          <button className="btn btn-primary btn-block pe-save" disabled={saving} onClick={() => void submit()}>
            <Check size={18} /> {saving ? "Guardando…" : "Guardar"}
          </button>
        </>
      )}
    </Sheet>
  );
}
