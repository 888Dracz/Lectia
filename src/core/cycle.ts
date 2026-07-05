import { addDays, compareIso, daysBetween } from "./date";
import type {
  CyclePhase,
  DailyLog,
  DaySnapshot,
  IsoDate,
  PeriodRecord,
  UserProfile,
} from "./types";

// ---------------------------------------------------------------------------
// Motor de fases del ciclo (Módulo 1 — núcleo del sistema, §2).
//
// A partir del histórico de menstruaciones estima la duración del ciclo y
// clasifica cualquier fecha en una de las 4 fases. Es el único módulo que
// produce el `DaySnapshot`, el contrato que consumen ejercicio y nutrición.
// ---------------------------------------------------------------------------

/** Nº mínimo de ciclos completos (intervalos) para una predicción confiable. */
export const MIN_CYCLES_FOR_PREDICTION = 3;

/** Duración de menstruación por defecto, en días. */
export const DEFAULT_MENSTRUATION_DAYS = 5;

/** Duración de ciclo por defecto cuando no hay histórico suficiente. */
export const DEFAULT_CYCLE_LENGTH = 28;

/** La fase lútea dura ~14 días; se usa para ubicar la ovulación hacia atrás. */
const LUTEAL_LENGTH = 14;

/** Rango plausible de un ciclo; descarta intervalos por registros olvidados. */
const MIN_PLAUSIBLE_CYCLE = 15;
const MAX_PLAUSIBLE_CYCLE = 60;

export interface CycleEstimate {
  /** Duración estimada del ciclo, en días. */
  longitud: number;
  /** `true` si hay suficientes ciclos históricos válidos. */
  confiable: boolean;
  /** Intervalos (en días) entre menstruaciones consecutivas ya filtrados. */
  intervalosValidos: number[];
  /** Desviación estándar de los intervalos (regularidad del ciclo). */
  desviacion: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Ordena los registros de menstruación por fecha de inicio ascendente. */
export function sortPeriods(periods: PeriodRecord[]): PeriodRecord[] {
  return [...periods].sort((a, b) => compareIso(a.inicio, b.inicio));
}

/**
 * Estima la duración del ciclo a partir del histórico de menstruaciones.
 * Usa la media de los intervalos plausibles entre inicios consecutivos.
 */
export function estimateCycleLength(
  periods: PeriodRecord[],
  fallback: number = DEFAULT_CYCLE_LENGTH,
): CycleEstimate {
  const sorted = sortPeriods(periods);
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetween(sorted[i - 1].inicio, sorted[i].inicio);
    if (gap >= MIN_PLAUSIBLE_CYCLE && gap <= MAX_PLAUSIBLE_CYCLE) {
      intervals.push(gap);
    }
  }

  const confiable = intervals.length >= MIN_CYCLES_FOR_PREDICTION;
  const media =
    intervals.length > 0
      ? intervals.reduce((s, n) => s + n, 0) / intervals.length
      : fallback;

  const varianza =
    intervals.length > 0
      ? intervals.reduce((s, n) => s + (n - media) ** 2, 0) / intervals.length
      : 0;

  return {
    longitud: Math.round(media),
    confiable,
    intervalosValidos: intervals,
    desviacion: Math.sqrt(varianza),
  };
}

/**
 * Día del ciclo (1-based) de `fecha` dado el inicio de menstruación de
 * referencia y la longitud del ciclo. Proyecta hacia adelante en múltiplos de
 * la longitud, de modo que funciona aunque el último registro sea antiguo.
 */
export function dayOfCycle(
  fecha: IsoDate,
  anclaInicio: IsoDate,
  longitud: number,
): number {
  const diff = daysBetween(anclaInicio, fecha);
  const mod = ((diff % longitud) + longitud) % longitud;
  return mod + 1;
}

/**
 * Clasifica un día del ciclo (1-based) en una de las 4 fases.
 * La ovulación se ubica ~14 días antes del siguiente periodo.
 */
export function classifyPhase(
  dia: number,
  longitud: number,
  duracionMenstruacion: number = DEFAULT_MENSTRUATION_DAYS,
): CyclePhase {
  const finMenstrual = clamp(duracionMenstruacion, 1, longitud);
  const ovulacion = clamp(longitud - LUTEAL_LENGTH, finMenstrual + 2, longitud - 1);
  const ovInicio = ovulacion - 1;
  const ovFin = ovulacion + 1;

  if (dia <= finMenstrual) return "menstrual";
  if (dia < ovInicio) return "folicular";
  if (dia <= ovFin) return "ovulatoria";
  return "lutea";
}

/**
 * Encuentra el inicio de menstruación de referencia (el más reciente en o
 * antes de `fecha`). Si `fecha` es anterior a todos los registros, usa el
 * primero disponible como ancla y proyecta hacia atrás con la longitud.
 */
function anchorFor(fecha: IsoDate, periods: PeriodRecord[]): IsoDate | null {
  const sorted = sortPeriods(periods);
  if (sorted.length === 0) return null;
  let anchor: IsoDate | null = null;
  for (const p of sorted) {
    if (compareIso(p.inicio, fecha) <= 0) anchor = p.inicio;
    else break;
  }
  return anchor ?? sorted[0].inicio;
}

/**
 * Construye el `DaySnapshot` de una fecha: el objeto que exportan los demás
 * módulos (§2). Combina el motor de fases con el registro diario de ánimo.
 */
export function buildSnapshot(
  fecha: IsoDate,
  periods: PeriodRecord[],
  profile: Pick<UserProfile, "duracionMenstruacion" | "duracionCicloPorDefecto">,
  dailyLog?: DailyLog,
): DaySnapshot {
  const estimate = estimateCycleLength(periods, profile.duracionCicloPorDefecto);
  const anchor = anchorFor(fecha, periods);

  // Sin ningún registro de menstruación no podemos anclar el ciclo; asumimos
  // día 1 en la fecha dada para no romper la UI, pero marcamos no confiable.
  const anclaInicio = anchor ?? fecha;
  const dia = dayOfCycle(fecha, anclaInicio, estimate.longitud);
  const fase = classifyPhase(dia, estimate.longitud, profile.duracionMenstruacion);

  return {
    fecha,
    faseCiclo: fase,
    diaDelCiclo: dia,
    longitudCiclo: estimate.longitud,
    prediccionConfiable: estimate.confiable && anchor !== null,
    estadoAnimo: dailyLog?.animo,
    sintomas: dailyLog?.sintomas ?? [],
  };
}

/**
 * Predice la fecha de inicio del próximo periodo a partir del último registro
 * y la longitud estimada. Devuelve `null` si no hay histórico.
 */
export function predictNextPeriod(
  periods: PeriodRecord[],
  fallback: number = DEFAULT_CYCLE_LENGTH,
): { fecha: IsoDate; confiable: boolean } | null {
  const sorted = sortPeriods(periods);
  if (sorted.length === 0) return null;
  const { longitud, confiable } = estimateCycleLength(periods, fallback);
  const ultimo = sorted[sorted.length - 1].inicio;
  return { fecha: addDays(ultimo, longitud), confiable };
}
