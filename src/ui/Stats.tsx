import { useMemo } from "react";
import { computeStats, symptomFrequency } from "../core";
import { useAppStore } from "../store/useAppStore";
import { MOOD_EMOJI, PHASE_LABEL, SYMPTOM_LABEL } from "./labels";
import type { Symptom } from "../core";

const REGULARITY_LABEL: Record<string, string> = {
  regular: "Regular ✓",
  algo_irregular: "Algo irregular",
  irregular: "Irregular",
  sin_datos: "Sin datos",
};

export function Stats() {
  const { state } = useAppStore();

  const stats = useMemo(
    () =>
      computeStats({
        periods: state.periods,
        dailyLogs: state.dailyLogs,
        exerciseLogs: state.exerciseLogs,
        mealLogs: state.mealLogs,
        profile: state.profile,
      }),
    [state],
  );

  const sintomas = useMemo(() => symptomFrequency(state.dailyLogs), [state.dailyLogs]);
  const maxSintoma = sintomas.length > 0 ? sintomas[0].conteo : 1;

  return (
    <div>
      <div className="card">
        <p className="eyebrow">📊 Resumen</p>
        <div className="metric-grid">
          <div className="metric">
            <div className="num">{stats.regularidad.longitudPromedio}</div>
            <div className="lbl">Días de ciclo promedio</div>
          </div>
          <div className="metric">
            <div className="num">{stats.adherenciaEjercicio.porcentaje}%</div>
            <div className="lbl">Adherencia ejercicio</div>
          </div>
          <div className="metric">
            <div className="num">
              {stats.animoPromedio !== null
                ? `${MOOD_EMOJI[Math.round(stats.animoPromedio)]} ${stats.animoPromedio}`
                : "—"}
            </div>
            <div className="lbl">Ánimo promedio</div>
          </div>
          <div className="metric">
            <div className="num">{stats.regularidad.ciclosRegistrados}</div>
            <div className="lbl">Ciclos registrados</div>
          </div>
        </div>
      </div>

      {/* Regularidad */}
      <div className="card">
        <p className="eyebrow">🔁 Regularidad del ciclo</p>
        <div className="row">
          <span>Estado</span>
          <span className="pill">
            {REGULARITY_LABEL[stats.regularidad.regularidad]}
          </span>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted">Variación</span>
          <span className="muted">± {stats.regularidad.desviacion} días</span>
        </div>
      </div>

      {/* Ánimo por fase */}
      <div className="card">
        <p className="eyebrow">🌙 Energía / ánimo por fase</p>
        {stats.animoPorFase.every((a) => a.promedio === null) ? (
          <p className="empty">Registrá tu ánimo para ver tendencias por fase.</p>
        ) : (
          stats.animoPorFase.map((a) => (
            <div className="barline" key={a.fase}>
              <span className="label">{PHASE_LABEL[a.fase]}</span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: a.promedio ? `${(a.promedio / 5) * 100}%` : "0%",
                  }}
                />
              </div>
              <span className="val">{a.promedio ?? "—"}</span>
            </div>
          ))
        )}
      </div>

      {/* Síntomas */}
      <div className="card">
        <p className="eyebrow">🩺 Síntomas recurrentes</p>
        {sintomas.length === 0 ? (
          <p className="empty">Sin síntomas registrados aún.</p>
        ) : (
          sintomas.map((s) => (
            <div className="barline" key={s.sintoma}>
              <span className="label">{SYMPTOM_LABEL[s.sintoma as Symptom] ?? s.sintoma}</span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${(s.conteo / maxSintoma) * 100}%` }}
                />
              </div>
              <span className="val">{s.conteo}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
