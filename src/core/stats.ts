import { estimateCycleLength } from "./cycle";
import { buildSnapshot } from "./cycle";
import type {
  CyclePhase,
  DailyLog,
  ExerciseLog,
  IsoDate,
  MealLog,
  PeriodRecord,
  UserProfile,
} from "./types";

// ---------------------------------------------------------------------------
// Estadística (§5.7) — dashboard de tendencias.
// ---------------------------------------------------------------------------

export interface CycleRegularity {
  longitudPromedio: number;
  desviacion: number;
  /** Etiqueta cualitativa de regularidad. */
  regularidad: "regular" | "algo_irregular" | "irregular" | "sin_datos";
  ciclosRegistrados: number;
}

export interface AdherenceStats {
  asignados: number;
  completados: number;
  /** Porcentaje 0–100. */
  porcentaje: number;
}

export interface PhaseMood {
  fase: CyclePhase;
  promedio: number | null;
  muestras: number;
}

export interface Stats {
  regularidad: CycleRegularity;
  adherenciaEjercicio: AdherenceStats;
  animoPorFase: PhaseMood[];
  comidasRegistradas: number;
  animoPromedio: number | null;
}

function classifyRegularity(
  desviacion: number,
  ciclos: number,
): CycleRegularity["regularidad"] {
  if (ciclos < 2) return "sin_datos";
  if (desviacion <= 2) return "regular";
  if (desviacion <= 4) return "algo_irregular";
  return "irregular";
}

export function cycleRegularity(
  periods: PeriodRecord[],
  fallback: number,
): CycleRegularity {
  const est = estimateCycleLength(periods, fallback);
  return {
    longitudPromedio: est.longitud,
    desviacion: Math.round(est.desviacion * 10) / 10,
    regularidad: classifyRegularity(est.desviacion, est.intervalosValidos.length),
    ciclosRegistrados: est.intervalosValidos.length,
  };
}

export function exerciseAdherence(logs: ExerciseLog[]): AdherenceStats {
  const asignados = logs.length;
  const completados = logs.filter((l) => l.completado).length;
  return {
    asignados,
    completados,
    porcentaje: asignados === 0 ? 0 : Math.round((completados / asignados) * 100),
  };
}

const ALL_PHASES: CyclePhase[] = ["menstrual", "folicular", "ovulatoria", "lutea"];

/**
 * Promedio de ánimo por fase del ciclo. Cruza cada registro de ánimo con la
 * fase que le correspondía ese día (según el motor de fases).
 */
export function moodByPhase(
  logs: DailyLog[],
  periods: PeriodRecord[],
  profile: UserProfile,
): PhaseMood[] {
  const acc: Record<CyclePhase, { sum: number; n: number }> = {
    menstrual: { sum: 0, n: 0 },
    folicular: { sum: 0, n: 0 },
    ovulatoria: { sum: 0, n: 0 },
    lutea: { sum: 0, n: 0 },
  };

  for (const log of logs) {
    if (log.animo === undefined) continue;
    const snap = buildSnapshot(log.fecha, periods, profile, log);
    acc[snap.faseCiclo].sum += log.animo;
    acc[snap.faseCiclo].n += 1;
  }

  return ALL_PHASES.map((fase) => ({
    fase,
    promedio:
      acc[fase].n === 0 ? null : Math.round((acc[fase].sum / acc[fase].n) * 10) / 10,
    muestras: acc[fase].n,
  }));
}

export function averageMood(logs: DailyLog[]): number | null {
  const withMood = logs.filter((l) => l.animo !== undefined);
  if (withMood.length === 0) return null;
  const sum = withMood.reduce((s, l) => s + (l.animo as number), 0);
  return Math.round((sum / withMood.length) * 10) / 10;
}

export function computeStats(input: {
  periods: PeriodRecord[];
  dailyLogs: DailyLog[];
  exerciseLogs: ExerciseLog[];
  mealLogs: MealLog[];
  profile: UserProfile;
}): Stats {
  return {
    regularidad: cycleRegularity(input.periods, input.profile.duracionCicloPorDefecto),
    adherenciaEjercicio: exerciseAdherence(input.exerciseLogs),
    animoPorFase: moodByPhase(input.dailyLogs, input.periods, input.profile),
    comidasRegistradas: input.mealLogs.length,
    animoPromedio: averageMood(input.dailyLogs),
  };
}

/** Cuenta síntomas por tipo en un rango (para el informe). */
export function symptomFrequency(
  logs: DailyLog[],
): { sintoma: string; conteo: number }[] {
  const counts = new Map<string, number>();
  for (const log of logs) {
    for (const s of log.sintomas) {
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([sintoma, conteo]) => ({ sintoma, conteo }))
    .sort((a, b) => b.conteo - a.conteo);
}

/** Filtra registros con fecha dentro de `[desde, hasta]` inclusive. */
export function inRange<T extends { fecha: IsoDate }>(
  items: T[],
  desde: IsoDate,
  hasta: IsoDate,
): T[] {
  return items.filter((i) => i.fecha >= desde && i.fecha <= hasta);
}
