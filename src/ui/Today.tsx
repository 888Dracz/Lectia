import { useMemo } from "react";
import {
  buildDailyAlarm,
  buildSnapshot,
  recommendExercise,
  recommendNutrition,
  tipForDay,
  todayIso,
  type MoodScore,
} from "../core";
import { useAppStore } from "../store/useAppStore";
import {
  ALL_SYMPTOMS,
  EXERCISE_LABEL,
  INTENSITY_LABEL,
  MOOD_EMOJI,
  PHASE_EMOJI,
  PHASE_LABEL,
  SYMPTOM_LABEL,
} from "./labels";

export function Today() {
  const { state, dispatch } = useAppStore();
  const hoy = todayIso();

  const dailyLog = state.dailyLogs.find((l) => l.fecha === hoy);
  const snapshot = useMemo(
    () => buildSnapshot(hoy, state.periods, state.profile, dailyLog),
    [hoy, state.periods, state.profile, dailyLog],
  );

  const alarm = buildDailyAlarm(snapshot);
  const ejercicio = recommendExercise(snapshot);
  const nutricion = recommendNutrition(snapshot);
  const tip = tipForDay(snapshot);

  const exerciseLog = state.exerciseLogs.find((l) => l.fecha === hoy);

  function setMood(m: MoodScore) {
    dispatch({ type: "UPSERT_MOOD", fecha: hoy, animo: m });
  }

  function completeExercise() {
    if (exerciseLog) {
      dispatch({ type: "TOGGLE_EXERCISE_DONE", fecha: hoy });
    } else {
      dispatch({
        type: "ADD_EXERCISE_LOG",
        log: { fecha: hoy, tipo: ejercicio.tipo, completado: true },
      });
    }
  }

  return (
    <div>
      {/* Hero: fase del día */}
      <div className={`hero phase-${snapshot.faseCiclo}`}>
        <div className="day">
          Día {snapshot.diaDelCiclo} del ciclo · {PHASE_EMOJI[snapshot.faseCiclo]}
        </div>
        <div className="phase-name">Fase {PHASE_LABEL[snapshot.faseCiclo]}</div>
        <div className="headline">{alarm.titulo.split("·")[0].trim()}</div>
        {!snapshot.prediccionConfiable && (
          <div className="pill warn" style={{ marginTop: 10 }}>
            ⓘ Estimación preliminar — registrá más ciclos
          </div>
        )}
      </div>

      {/* Alarma / consejo del día */}
      <div className="card">
        <p className="eyebrow">🔔 Alarma del día</p>
        <p style={{ margin: "0 0 6px", fontStyle: "italic" }}>“{tip.texto}”</p>
        {tip.fuente && <p className="muted">— {tip.fuente}</p>}
      </div>

      {/* Ejercicio */}
      <div className="card">
        <div className="row">
          <p className="eyebrow" style={{ margin: 0 }}>🏋️ Ejercicio sugerido</p>
          <span className="pill">{INTENSITY_LABEL[ejercicio.intensidad]}</span>
        </div>
        <h3 style={{ margin: "8px 0 4px" }}>{ejercicio.titulo}</h3>
        <p className="muted" style={{ margin: 0 }}>
          {EXERCISE_LABEL[ejercicio.tipo]} · {ejercicio.duracionMin} min
        </p>
        <p style={{ marginBottom: 12 }}>{ejercicio.descripcion}</p>
        {ejercicio.ajustadoPorAnimo && (
          <div className="pill warn" style={{ marginBottom: 12 }}>
            💛 Ajustado por tu ánimo de hoy
          </div>
        )}
        <button
          className={`btn ${exerciseLog?.completado ? "secondary" : ""}`}
          onClick={completeExercise}
        >
          {exerciseLog?.completado ? "✓ Completado hoy" : "Marcar como completado"}
        </button>
      </div>

      {/* Nutrición */}
      <div className="card">
        <p className="eyebrow">🥗 Enfoque nutricional</p>
        <h3 style={{ margin: "0 0 6px" }}>{nutricion.enfoque}</h3>
        <p style={{ marginTop: 0 }}>{nutricion.consejo}</p>
        <div className="tag-list">
          {nutricion.alimentosSugeridos.map((a) => (
            <span className="tag" key={a}>{a}</span>
          ))}
        </div>
      </div>

      {/* Registro de ánimo */}
      <div className="card">
        <p className="eyebrow">🧠 ¿Cómo te sentís hoy?</p>
        <div className="mood-row">
          {([1, 2, 3, 4, 5] as MoodScore[]).map((m) => (
            <button
              key={m}
              className={`mood-btn ${dailyLog?.animo === m ? "selected" : ""}`}
              onClick={() => setMood(m)}
              aria-label={`Ánimo ${m}`}
            >
              {MOOD_EMOJI[m]}
            </button>
          ))}
        </div>

        <label>Síntomas</label>
        <div className="chip-row">
          {ALL_SYMPTOMS.map((s) => (
            <button
              key={s}
              className={`chip ${dailyLog?.sintomas.includes(s) ? "on" : ""}`}
              onClick={() => dispatch({ type: "TOGGLE_SYMPTOM", fecha: hoy, sintoma: s })}
            >
              {SYMPTOM_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
