import { useAppStore } from "../store/useAppStore";
import type { Goal, Level } from "../core";

const GOAL_LABEL: Record<Goal, string> = {
  perdida_peso: "Pérdida de peso",
  tono: "Tono",
  rendimiento: "Rendimiento",
  mantenimiento: "Mantenimiento",
};

const LEVEL_LABEL: Record<Level, string> = {
  principiante: "Principiante",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
};

export function Profile() {
  const { state, dispatch } = useAppStore();
  const p = state.profile;

  return (
    <div>
      <div className="card">
        <p className="eyebrow">👤 Tu perfil</p>

        <label htmlFor="nombre">Nombre</label>
        <input
          id="nombre"
          value={p.nombre ?? ""}
          placeholder="Tu nombre"
          onChange={(e) => dispatch({ type: "SET_PROFILE", profile: { nombre: e.target.value } })}
        />

        <label htmlFor="nivel">Nivel</label>
        <select
          id="nivel"
          value={p.nivel}
          onChange={(e) => dispatch({ type: "SET_PROFILE", profile: { nivel: e.target.value as Level } })}
        >
          {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
            <option key={l} value={l}>{LEVEL_LABEL[l]}</option>
          ))}
        </select>

        <label htmlFor="objetivo">Objetivo</label>
        <select
          id="objetivo"
          value={p.objetivo}
          onChange={(e) => dispatch({ type: "SET_PROFILE", profile: { objetivo: e.target.value as Goal } })}
        >
          {(Object.keys(GOAL_LABEL) as Goal[]).map((g) => (
            <option key={g} value={g}>{GOAL_LABEL[g]}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <p className="eyebrow">⚙️ Parámetros del ciclo</p>
        <label htmlFor="dur-menstruacion">Duración de menstruación (días)</label>
        <input
          id="dur-menstruacion"
          type="number"
          min={1}
          max={10}
          value={p.duracionMenstruacion}
          onChange={(e) =>
            dispatch({
              type: "SET_PROFILE",
              profile: { duracionMenstruacion: Number(e.target.value) || 1 },
            })
          }
        />
        <label htmlFor="dur-ciclo">Duración de ciclo por defecto (días)</label>
        <input
          id="dur-ciclo"
          type="number"
          min={15}
          max={45}
          value={p.duracionCicloPorDefecto}
          onChange={(e) =>
            dispatch({
              type: "SET_PROFILE",
              profile: { duracionCicloPorDefecto: Number(e.target.value) || 28 },
            })
          }
        />
        <p className="muted" style={{ marginTop: 8 }}>
          Se usa solo hasta tener 3 ciclos registrados; luego la app estima tu
          duración real automáticamente.
        </p>
      </div>

      <div className="card">
        <p className="eyebrow">🧪 Datos</p>
        <div className="btn-row">
          <button
            className="btn secondary"
            onClick={() => dispatch({ type: "RESET_DEMO" })}
          >
            Cargar datos demo
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              if (confirm("¿Borrar todos tus datos?")) dispatch({ type: "RESET_EMPTY" });
            }}
          >
            Empezar de cero
          </button>
        </div>
      </div>

      <p className="center muted" style={{ fontSize: 11.5, padding: "0 8px 8px" }}>
        Campanita no reemplaza el consejo médico. Los datos se guardan solo en
        este dispositivo.
      </p>
    </div>
  );
}
