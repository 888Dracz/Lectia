import type {
  CyclePhase,
  DaySnapshot,
  ExerciseRecommendation,
  Intensity,
  MoodScore,
} from "./types";

// ---------------------------------------------------------------------------
// Módulo 2 — Planificación deportiva (§3).
//
// Regla de negocio central: la fase del ciclo define la rutina base, y un
// estado de ánimo bajo puede SOBRESCRIBIR esa recomendación bajando un nivel
// de intensidad.
// ---------------------------------------------------------------------------

/** Escala de intensidad ordenada de menor a mayor, para poder "bajar" un nivel. */
export const INTENSITY_ORDER: Intensity[] = [
  "descanso",
  "baja",
  "moderada",
  "alta",
  "maxima",
];

/** Por debajo (o igual) de este ánimo, se suaviza la rutina. */
export const LOW_MOOD_THRESHOLD: MoodScore = 2;

interface PhasePlan {
  tipo: ExerciseRecommendation["tipo"];
  intensidad: Intensity;
  duracionMin: number;
  titulo: string;
  descripcion: string;
}

/** Tabla de recomendaciones por fase (regla de negocio de §3). */
const PHASE_PLAN: Record<CyclePhase, PhasePlan> = {
  menstrual: {
    tipo: "yoga",
    intensidad: "baja",
    duracionMin: 30,
    titulo: "Movilidad y descanso activo",
    descripcion:
      "Baja intensidad: yoga suave, movilidad y caminatas. Escucha a tu cuerpo.",
  },
  folicular: {
    tipo: "fuerza",
    intensidad: "alta",
    duracionMin: 50,
    titulo: "Fuerza y metas nuevas",
    descripcion:
      "Buen momento para alta intensidad. Ideal para progresar en fuerza y proponerte retos.",
  },
  ovulatoria: {
    tipo: "hiit",
    intensidad: "maxima",
    duracionMin: 45,
    titulo: "Pico de energía",
    descripcion:
      "Máxima exigencia: HIIT o entrenamientos exigentes. Aprovecha tu punto álgido de energía.",
  },
  lutea: {
    tipo: "cardio",
    intensidad: "moderada",
    duracionMin: 40,
    titulo: "Cardio suave y recuperación",
    descripcion:
      "Intensidad moderada y decreciente: cardio suave, técnica y recuperación.",
  },
};

/** Ajustes de tipo de rutina cuando se baja la intensidad por ánimo. */
const SOFTER_TYPE: Partial<Record<ExerciseRecommendation["tipo"], ExerciseRecommendation["tipo"]>> =
  {
    hiit: "cardio",
    fuerza: "movilidad",
    cardio: "caminata",
    yoga: "movilidad",
  };

/** Baja un nivel la intensidad; nunca por debajo de "descanso". */
export function lowerIntensity(intensidad: Intensity): Intensity {
  const idx = INTENSITY_ORDER.indexOf(intensidad);
  return INTENSITY_ORDER[Math.max(0, idx - 1)];
}

/**
 * Recomienda la rutina del día combinando fase + ánimo.
 * Si el ánimo reportado es bajo (≤ {@link LOW_MOOD_THRESHOLD}), suaviza la
 * rutina que "tocaría por calendario" (override por estado de ánimo, §3).
 */
export function recommendExercise(snapshot: DaySnapshot): ExerciseRecommendation {
  const base = PHASE_PLAN[snapshot.faseCiclo];
  const animoBajo =
    snapshot.estadoAnimo !== undefined &&
    snapshot.estadoAnimo <= LOW_MOOD_THRESHOLD;

  if (!animoBajo) {
    return {
      fase: snapshot.faseCiclo,
      tipo: base.tipo,
      intensidad: base.intensidad,
      duracionMin: base.duracionMin,
      titulo: base.titulo,
      descripcion: base.descripcion,
      ajustadoPorAnimo: false,
    };
  }

  const intensidad = lowerIntensity(base.intensidad);
  const tipo = SOFTER_TYPE[base.tipo] ?? base.tipo;
  return {
    fase: snapshot.faseCiclo,
    tipo,
    intensidad,
    duracionMin: Math.max(20, Math.round(base.duracionMin * 0.7)),
    titulo: "Versión suave para hoy",
    descripcion:
      "Notamos que tu ánimo está bajo, así que suavizamos la rutina del día. " +
      "Mover el cuerpo con calma también cuenta. 💛",
    ajustadoPorAnimo: true,
  };
}
