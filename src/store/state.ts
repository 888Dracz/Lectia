import type {
  DailyLog,
  ExerciseLog,
  MealLog,
  PeriodRecord,
  UserProfile,
} from "../core";

// ---------------------------------------------------------------------------
// Estado de la aplicación y persistencia en localStorage.
// Una v1 no necesita backend: todos los datos viven en el dispositivo.
// ---------------------------------------------------------------------------

export interface AppState {
  profile: UserProfile;
  periods: PeriodRecord[];
  dailyLogs: DailyLog[];
  exerciseLogs: ExerciseLog[];
  mealLogs: MealLog[];
}

const STORAGE_KEY = "campanita.state.v1";

export const defaultProfile: UserProfile = {
  nombre: "",
  nivel: "intermedio",
  objetivo: "mantenimiento",
  restricciones: [],
  duracionMenstruacion: 5,
  duracionCicloPorDefecto: 28,
};

/**
 * Estado de ejemplo para que la app tenga contenido significativo la primera
 * vez (histórico de ~4 ciclos, algunos registros de ánimo y ejercicio).
 * Anclado a comienzos de 2026 para ser determinista en tests/demo.
 */
export function seedState(): AppState {
  return {
    profile: {
      ...defaultProfile,
      nombre: "Ana",
      nivel: "intermedio",
      objetivo: "tono",
    },
    periods: [
      { inicio: "2026-04-02", fin: "2026-04-06", flujo: "normal" },
      { inicio: "2026-04-30", fin: "2026-05-04", flujo: "normal" },
      { inicio: "2026-05-29", fin: "2026-06-02", flujo: "abundante" },
      { inicio: "2026-06-26", fin: "2026-06-30", flujo: "normal" },
    ],
    dailyLogs: [
      { fecha: "2026-06-26", animo: 2, sintomas: ["colicos", "fatiga"] },
      { fecha: "2026-06-27", animo: 2, sintomas: ["colicos"] },
      { fecha: "2026-07-01", animo: 4, sintomas: [] },
      { fecha: "2026-07-03", animo: 5, sintomas: [] },
    ],
    exerciseLogs: [
      { fecha: "2026-06-26", tipo: "yoga", completado: true },
      { fecha: "2026-07-01", tipo: "fuerza", completado: true },
      { fecha: "2026-07-03", tipo: "hiit", completado: false },
    ],
    mealLogs: [
      { fecha: "2026-06-26", descripcion: "Lentejas con espinaca" },
      { fecha: "2026-07-01", descripcion: "Pollo con quinoa" },
    ],
  };
}

export function emptyState(): AppState {
  return {
    profile: defaultProfile,
    periods: [],
    dailyLogs: [],
    exerciseLogs: [],
    mealLogs: [],
  };
}

export function loadState(): AppState {
  if (typeof localStorage === "undefined") return seedState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      profile: { ...defaultProfile, ...parsed.profile },
      periods: parsed.periods ?? [],
      dailyLogs: parsed.dailyLogs ?? [],
      exerciseLogs: parsed.exerciseLogs ?? [],
      mealLogs: parsed.mealLogs ?? [],
    };
  } catch {
    return seedState();
  }
}

export function saveState(state: AppState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Cuota llena o modo privado: no bloqueamos la app por esto.
  }
}

export function clearState(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
