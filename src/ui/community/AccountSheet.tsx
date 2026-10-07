import { LogIn, LogOut, Mail, ShieldCheck, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import type { EmailPurpose } from "../../community/api";
import { deleteAccount, reportError, sendEmailCode, signOut, useCommunity, verifyEmailCode } from "../../community/store";
import { useStore } from "../../store/store";
import { toast } from "../../store/ui";
import { Switch } from "../components/controls";
import { confirmDialog } from "../components/Dialog";
import { Sheet } from "../components/Sheet";

/** Cuenta de la comunidad: correo, privacidad, cerrar sesión y borrar. */
export function AccountSheet({ open, onClose, startWith }: { open: boolean; onClose: () => void; startWith?: EmailPurpose }) {
  const session = useCommunity((s) => s.session);
  const profile = useCommunity((s) => s.profile);
  const mode = useCommunity((s) => s.mode);
  const community = useStore((s) => s.community);
  const setCommunity = useStore((s) => s.setCommunity);
  const [flow, setFlow] = useState<EmailPurpose | null>(null);

  useEffect(() => {
    if (open) setFlow(startWith ?? null);
  }, [open, startWith]);

  const onlyLogin = startWith === "login" && !profile;

  const leave = async () => {
    const anon = session?.anonymous;
    const ok = await confirmDialog(
      "¿Cerrar sesión?",
      anon
        ? "Tu cuenta no tiene un correo vinculado: si cierras sesión no podrás volver a entrar a este perfil. Vincula un correo antes para no perderlo."
        : "Podrás volver a entrar con tu correo cuando quieras.",
      "Cerrar sesión",
      !!anon
    );
    if (!ok) return;
    try {
      await signOut();
      onClose();
      toast("Sesión cerrada");
    } catch (e) {
      reportError(e);
    }
  };

  const remove = async () => {
    const ok = await confirmDialog(
      "¿Eliminar tu cuenta de la comunidad?",
      "Se borrarán tu perfil, tus amistades, tu liga y todo lo que publicaste. Tus libros y tu progreso en este teléfono no se tocan.",
      "Eliminar cuenta",
      true
    );
    if (!ok) return;
    try {
      await deleteAccount();
      onClose();
      toast("Cuenta eliminada");
    } catch (e) {
      reportError(e);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={onlyLogin ? "Entrar con mi correo" : "Cuenta y privacidad"} height={onlyLogin ? undefined : "85dvh"}>
      {flow ? (
        <EmailFlow purpose={flow} hasProfile={!!profile} onDone={() => (onlyLogin ? onClose() : setFlow(null))} onCancel={() => (onlyLogin ? onClose() : setFlow(null))} />
      ) : (
        <>
          {mode === "demo" ? (
            <div className="acct-card">
              <ShieldCheck size={22} />
              <div>
                <b>Modo demostración</b>
                <p className="muted">
                  Esta copia de Lectia no está conectada al servidor de la comunidad. Para activarla hay que configurar Supabase (ver el README del proyecto).
                </p>
              </div>
            </div>
          ) : session?.anonymous ? (
            <div className="acct-card warn">
              <ShieldCheck size={22} />
              <div>
                <b>Protege tu cuenta</b>
                <p className="muted">Vincula un correo para no perder tu perfil, tus rachas de amigos y tu liga si cambias de teléfono.</p>
                <button className="btn btn-sm btn-primary" onClick={() => setFlow("link")}>
                  <Mail size={16} /> Vincular correo
                </button>
              </div>
            </div>
          ) : session?.email ? (
            <div className="acct-card ok">
              <ShieldCheck size={22} />
              <div>
                <b>Cuenta protegida</b>
                <p className="muted">{session.email}</p>
              </div>
            </div>
          ) : null}

          <div className="section-title" style={{ marginTop: 18 }}>
            Qué se comparte
          </div>
          <div className="list">
            <div className="list-item">
              <span className="li-main">
                <div className="li-title">Libros que termino</div>
                <div className="li-sub">Se publican en las Novedades de tus amigos</div>
              </span>
              <Switch on={community.autoShareBooks} onChange={(v) => setCommunity({ autoShareBooks: v })} />
            </div>
            <div className="list-item">
              <span className="li-main">
                <div className="li-title">Logros, rachas y ascensos</div>
                <div className="li-sub">Rachas de 7, 30, 100… días, niveles y ligas</div>
              </span>
              <Switch on={community.autoShareMilestones} onChange={(v) => setCommunity({ autoShareMilestones: v })} />
            </div>
            <div className="list-item">
              <span className="li-main">
                <div className="li-title">Mostrar qué estoy leyendo</div>
                <div className="li-sub">En tu perfil, el libro que abriste por última vez</div>
              </span>
              <Switch on={community.showReadingNow} onChange={(v) => setCommunity({ showReadingNow: v })} />
            </div>
          </div>
          <p className="faint small-print">
            Tu perfil, tu racha, tu nivel y tu liga son visibles para otros lectores. Lo que compartes en Novedades solo lo ven tus amigos. Los archivos de tus libros
            nunca salen de este teléfono.
          </p>

          {mode === "online" && (
            <div className="list" style={{ marginTop: 18 }}>
              <button className="list-item" onClick={() => setFlow("login")}>
                <span className="li-icon">
                  <LogIn size={18} />
                </span>
                <span className="li-main">
                  <div className="li-title">Entrar con otra cuenta</div>
                  <div className="li-sub">Usa el correo de tu cuenta en otro teléfono</div>
                </span>
              </button>
              {session && (
                <button className="list-item" onClick={() => void leave()}>
                  <span className="li-icon">
                    <LogOut size={18} />
                  </span>
                  <span className="li-main li-title">Cerrar sesión</span>
                </button>
              )}
            </div>
          )}
          {profile && (
            <button className="btn btn-danger btn-block" style={{ marginTop: 18 }} onClick={() => void remove()}>
              <Trash size={17} /> {mode === "demo" ? "Borrar perfil de demostración" : "Eliminar mi cuenta de la comunidad"}
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}

function EmailFlow({ purpose, hasProfile, onDone, onCancel }: { purpose: EmailPurpose; hasProfile: boolean; onDone: () => void; onCancel: () => void }) {
  const session = useCommunity((s) => s.session);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast("Escribe un correo válido", { tone: "error" });
    if (purpose === "login" && hasProfile && session?.anonymous) {
      const ok = await confirmDialog(
        "¿Entrar con otra cuenta?",
        "Este perfil no tiene correo vinculado: al cambiar de cuenta perderás el acceso a él.",
        "Continuar",
        true
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await sendEmailCode(email, purpose);
      setSent(true);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      await verifyEmailCode(email, code, purpose);
      toast(purpose === "link" ? "Correo vinculado: tu cuenta está protegida" : "¡Listo! Entraste a tu cuenta", { tone: "success" });
      onDone();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="email-flow">
      <p className="muted">
        {purpose === "link"
          ? "Te enviaremos un código para confirmar que el correo es tuyo. Después podrás entrar a tu perfil desde cualquier teléfono."
          : "Escribe el correo de tu cuenta y te enviaremos un código para entrar."}
      </p>
      <label className="label" htmlFor="ef-email">
        Correo
      </label>
      <input
        id="ef-email"
        className="field"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        disabled={sent}
        placeholder="tu@correo.com"
        onChange={(e) => setEmail(e.target.value)}
      />
      {sent && (
        <>
          <label className="label" htmlFor="ef-code">
            Código que llegó a tu correo
          </label>
          <input
            id="ef-code"
            className="field code-field"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            placeholder="123456"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <p className="faint small-print">¿No llegó? Revisa la carpeta de spam o espera un minuto y vuelve a pedirlo.</p>
        </>
      )}
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn btn-ghost" onClick={sent ? () => setSent(false) : onCancel}>
          {sent ? "Cambiar correo" : "Cancelar"}
        </button>
        <span className="spacer" />
        {sent ? (
          <button className="btn btn-primary" disabled={busy || code.length < 6} onClick={() => void verify()}>
            Confirmar
          </button>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={() => void send()}>
            Enviar código
          </button>
        )}
      </div>
    </div>
  );
}
