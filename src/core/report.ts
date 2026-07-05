import { addDays, daysBetween } from "./date";
import {
  cycleRegularity,
  exerciseAdherence,
  inRange,
  moodByPhase,
  symptomFrequency,
} from "./stats";
import type {
  DailyLog,
  ExerciseLog,
  IsoDate,
  MealLog,
  PeriodRecord,
  UserProfile,
} from "./types";

// ---------------------------------------------------------------------------
// Informe médico automático (§5.6) — reporte periódico con patrones
// detectados, pensado para compartir con un médico o nutricionista.
// ---------------------------------------------------------------------------

export interface MedicalReport {
  rango: { desde: IsoDate; hasta: IsoDate };
  generadoEl: IsoDate;
  usuaria: { nombre: string; objetivo: string; nivel: string };
  ciclo: {
    longitudPromedio: number;
    regularidad: string;
    ciclosRegistrados: number;
    duracionMenstruacionPromedio: number | null;
  };
  sintomasRecurrentes: { sintoma: string; conteo: number }[];
  animoPorFase: { fase: string; promedio: number | null; muestras: number }[];
  adherenciaEjercicio: { completados: number; asignados: number; porcentaje: number };
  comidasRegistradas: number;
  observaciones: string[];
}

const REGULARITY_LABEL: Record<string, string> = {
  regular: "Regular",
  algo_irregular: "Algo irregular",
  irregular: "Irregular",
  sin_datos: "Sin datos suficientes",
};

function avgMenstruationDuration(periods: PeriodRecord[]): number | null {
  const withFin = periods.filter((p) => p.fin);
  if (withFin.length === 0) return null;
  const total = withFin.reduce(
    (s, p) => s + (daysBetween(p.inicio, p.fin as IsoDate) + 1),
    0,
  );
  return Math.round((total / withFin.length) * 10) / 10;
}

/**
 * Genera el informe médico de un rango de fechas. Reúne patrones de ciclo,
 * síntomas, ánimo por fase y adherencia, y añade observaciones automáticas.
 */
export function generateMedicalReport(input: {
  desde: IsoDate;
  hasta: IsoDate;
  hoy: IsoDate;
  profile: UserProfile;
  periods: PeriodRecord[];
  dailyLogs: DailyLog[];
  exerciseLogs: ExerciseLog[];
  mealLogs: MealLog[];
}): MedicalReport {
  const { desde, hasta } = input;
  // Los periodos se filtran por su fecha de inicio (no tienen campo `fecha`).
  const periodsRango = input.periods.filter(
    (p) => p.inicio >= desde && p.inicio <= hasta,
  );
  const dailyRango = inRange(input.dailyLogs, desde, hasta);
  const exerciseRango = inRange(input.exerciseLogs, desde, hasta);
  const mealRango = inRange(input.mealLogs, desde, hasta);

  const reg = cycleRegularity(input.periods, input.profile.duracionCicloPorDefecto);
  const sintomas = symptomFrequency(dailyRango);
  const animo = moodByPhase(dailyRango, input.periods, input.profile);
  const adher = exerciseAdherence(exerciseRango);
  const durMenstruacion = avgMenstruationDuration(periodsRango);

  const observaciones: string[] = [];
  if (reg.regularidad === "irregular") {
    observaciones.push(
      "El ciclo muestra alta variabilidad; conviene confirmar el patrón con más registros o consulta profesional.",
    );
  }
  if (reg.ciclosRegistrados < 3) {
    observaciones.push(
      "Aún hay menos de 3 ciclos completos registrados: las estimaciones son preliminares.",
    );
  }
  const lutea = animo.find((a) => a.fase === "lutea");
  if (lutea && lutea.promedio !== null && lutea.promedio <= 2.5 && lutea.muestras >= 3) {
    observaciones.push(
      "El ánimo promedio en fase lútea es notablemente bajo; podría indicar síntomas premenstruales a monitorear.",
    );
  }
  if (adher.asignados >= 5 && adher.porcentaje < 40) {
    observaciones.push(
      "La adherencia al ejercicio es baja en el periodo; podría revisarse la carga planificada.",
    );
  }
  const topSintoma = sintomas[0];
  if (topSintoma && topSintoma.conteo >= 3) {
    observaciones.push(
      `Síntoma más recurrente: ${topSintoma.sintoma} (${topSintoma.conteo} registros).`,
    );
  }
  if (observaciones.length === 0) {
    observaciones.push("Sin hallazgos que requieran atención especial en el periodo.");
  }

  return {
    rango: { desde, hasta },
    generadoEl: input.hoy,
    usuaria: {
      nombre: input.profile.nombre ?? "Usuaria",
      objetivo: input.profile.objetivo,
      nivel: input.profile.nivel,
    },
    ciclo: {
      longitudPromedio: reg.longitudPromedio,
      regularidad: REGULARITY_LABEL[reg.regularidad] ?? reg.regularidad,
      ciclosRegistrados: reg.ciclosRegistrados,
      duracionMenstruacionPromedio: durMenstruacion,
    },
    sintomasRecurrentes: sintomas,
    animoPorFase: animo,
    adherenciaEjercicio: {
      completados: adher.completados,
      asignados: adher.asignados,
      porcentaje: adher.porcentaje,
    },
    comidasRegistradas: mealRango.length,
    observaciones,
  };
}

/** Rango del "mes anterior" (30 días hasta hoy) para el informe mensual. */
export function monthlyRange(hoy: IsoDate): { desde: IsoDate; hasta: IsoDate } {
  return { desde: addDays(hoy, -29), hasta: hoy };
}

/** Renderiza el informe como texto plano, listo para compartir/exportar. */
export function reportToText(report: MedicalReport): string {
  const lines: string[] = [];
  lines.push("INFORME DE SALUD CÍCLICA — Campanita");
  lines.push(`Generado: ${report.generadoEl}`);
  lines.push(`Periodo: ${report.rango.desde} a ${report.rango.hasta}`);
  lines.push(`Usuaria: ${report.usuaria.nombre} · Objetivo: ${report.usuaria.objetivo} · Nivel: ${report.usuaria.nivel}`);
  lines.push("");
  lines.push("— CICLO —");
  lines.push(`Longitud promedio: ${report.ciclo.longitudPromedio} días`);
  lines.push(`Regularidad: ${report.ciclo.regularidad}`);
  lines.push(`Ciclos registrados: ${report.ciclo.ciclosRegistrados}`);
  if (report.ciclo.duracionMenstruacionPromedio !== null) {
    lines.push(`Duración de menstruación promedio: ${report.ciclo.duracionMenstruacionPromedio} días`);
  }
  lines.push("");
  lines.push("— SÍNTOMAS RECURRENTES —");
  if (report.sintomasRecurrentes.length === 0) {
    lines.push("Sin síntomas registrados.");
  } else {
    for (const s of report.sintomasRecurrentes) {
      lines.push(`• ${s.sintoma}: ${s.conteo}`);
    }
  }
  lines.push("");
  lines.push("— ÁNIMO POR FASE —");
  for (const a of report.animoPorFase) {
    lines.push(`• ${a.fase}: ${a.promedio ?? "s/d"} (${a.muestras} registros)`);
  }
  lines.push("");
  lines.push("— ADHERENCIA A EJERCICIO —");
  lines.push(
    `${report.adherenciaEjercicio.completados}/${report.adherenciaEjercicio.asignados} rutinas (${report.adherenciaEjercicio.porcentaje}%)`,
  );
  lines.push(`Comidas registradas: ${report.comidasRegistradas}`);
  lines.push("");
  lines.push("— OBSERVACIONES —");
  for (const o of report.observaciones) {
    lines.push(`• ${o}`);
  }
  return lines.join("\n");
}
