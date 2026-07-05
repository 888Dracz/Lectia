import { useMemo, useState } from "react";
import {
  addDays,
  buildSnapshot,
  daysBetween,
  isValidIsoDate,
  predictNextPeriod,
  sortPeriods,
  todayIso,
  type FlowLevel,
} from "../core";
import { useAppStore } from "../store/useAppStore";
import { PHASE_EMOJI, PHASE_LABEL, formatShort } from "./labels";

export function Cycle() {
  const { state, dispatch } = useAppStore();
  const hoy = todayIso();
  const [nuevo, setNuevo] = useState(hoy);
  const [flujo, setFlujo] = useState<FlowLevel>("normal");

  const next = predictNextPeriod(state.periods, state.profile.duracionCicloPorDefecto);
  const sorted = useMemo(() => sortPeriods(state.periods).reverse(), [state.periods]);

  // Tira de calendario: 14 días centrados en hoy.
  const strip = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const fecha = addDays(hoy, i - 3);
      const snap = buildSnapshot(fecha, state.periods, state.profile);
      return { fecha, snap };
    });
  }, [hoy, state.periods, state.profile]);

  function addPeriod() {
    if (!isValidIsoDate(nuevo)) return;
    dispatch({ type: "ADD_PERIOD", period: { inicio: nuevo, flujo } });
  }

  const diasParaProximo = next ? daysBetween(hoy, next.fecha) : null;

  return (
    <div>
      {/* Predicción próximo periodo */}
      <div className="card">
        <p className="eyebrow">🔮 Próximo periodo</p>
        {next ? (
          <>
            <h2 style={{ margin: "0 0 4px" }}>
              {formatShort(next.fecha)}
              {diasParaProximo !== null && diasParaProximo >= 0 && (
                <span className="muted"> · en {diasParaProximo} días</span>
              )}
            </h2>
            <span className={`pill ${next.confiable ? "" : "warn"}`}>
              {next.confiable
                ? "Predicción confiable"
                : "Preliminar · registrá 3+ ciclos"}
            </span>
          </>
        ) : (
          <p className="muted">Registrá tu primera menstruación para empezar.</p>
        )}
      </div>

      {/* Tira de fases */}
      <div className="card">
        <p className="eyebrow">📅 Tus fases</p>
        <div className="strip">
          {strip.map(({ fecha, snap }) => (
            <div
              key={fecha}
              className={`cell ${fecha === hoy ? "today" : ""}`}
              title={`${PHASE_LABEL[snap.faseCiclo]} · día ${snap.diaDelCiclo}`}
            >
              <div className="d">{Number(fecha.split("-")[2])}</div>
              <div className="m">{formatShort(fecha).split(" ")[1]}</div>
              <span className={`dot dot-${snap.faseCiclo} ph`} />
            </div>
          ))}
        </div>
        <div className="tag-list" style={{ marginTop: 6 }}>
          {(["menstrual", "folicular", "ovulatoria", "lutea"] as const).map((p) => (
            <span className="pill" key={p}>
              <span className={`dot dot-${p}`} /> {PHASE_EMOJI[p]} {PHASE_LABEL[p]}
            </span>
          ))}
        </div>
      </div>

      {/* Registrar menstruación */}
      <div className="card">
        <p className="eyebrow">➕ Registrar menstruación</p>
        <label htmlFor="fecha-periodo">Fecha de inicio</label>
        <input
          id="fecha-periodo"
          type="date"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
        />
        <label htmlFor="flujo">Flujo</label>
        <select id="flujo" value={flujo} onChange={(e) => setFlujo(e.target.value as FlowLevel)}>
          <option value="ligero">Ligero</option>
          <option value="normal">Normal</option>
          <option value="abundante">Abundante</option>
        </select>
        <div className="spacer" />
        <button className="btn" onClick={addPeriod}>
          Guardar inicio de periodo
        </button>
      </div>

      {/* Histórico */}
      <div className="card">
        <p className="eyebrow">📖 Histórico de ciclos</p>
        {sorted.length === 0 ? (
          <p className="empty">Todavía no hay registros.</p>
        ) : (
          sorted.map((p, i) => {
            const anterior = sorted[i + 1];
            const largo = anterior ? daysBetween(anterior.inicio, p.inicio) : null;
            return (
              <div className="list-item" key={p.inicio}>
                <div>
                  <strong>{formatShort(p.inicio)}</strong>
                  <div className="muted">
                    {p.flujo ? `Flujo ${p.flujo}` : "—"}
                    {largo !== null && ` · ciclo de ${largo} días`}
                  </div>
                </div>
                <button
                  className="link-btn danger"
                  onClick={() => dispatch({ type: "REMOVE_PERIOD", inicio: p.inicio })}
                >
                  Eliminar
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
