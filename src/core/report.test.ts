import { describe, expect, it } from "vitest";
import { generateMedicalReport, monthlyRange, reportToText } from "./report";
import type {
  DailyLog,
  ExerciseLog,
  MealLog,
  PeriodRecord,
  UserProfile,
} from "./types";

const profile: UserProfile = {
  nombre: "Ana",
  nivel: "intermedio",
  objetivo: "tono",
  restricciones: [],
  duracionMenstruacion: 5,
  duracionCicloPorDefecto: 28,
};

const periods: PeriodRecord[] = [
  { inicio: "2026-01-01", fin: "2026-01-05" },
  { inicio: "2026-01-29", fin: "2026-02-02" },
  { inicio: "2026-02-26", fin: "2026-03-02" },
  { inicio: "2026-03-26", fin: "2026-03-30" },
];

const dailyLogs: DailyLog[] = [
  { fecha: "2026-03-02", animo: 2, sintomas: ["colicos", "fatiga"] },
  { fecha: "2026-03-03", animo: 2, sintomas: ["colicos"] },
  { fecha: "2026-03-10", animo: 4, sintomas: [] },
  { fecha: "2026-03-15", animo: 5, sintomas: ["colicos"] },
];

const exerciseLogs: ExerciseLog[] = [
  { fecha: "2026-03-02", tipo: "yoga", completado: true },
  { fecha: "2026-03-10", tipo: "fuerza", completado: true },
  { fecha: "2026-03-15", tipo: "hiit", completado: false },
];

const mealLogs: MealLog[] = [
  { fecha: "2026-03-02", descripcion: "avena" },
  { fecha: "2026-03-10", descripcion: "pollo con arroz" },
];

describe("monthlyRange", () => {
  it("cubre 30 días hasta hoy", () => {
    expect(monthlyRange("2026-03-30")).toEqual({
      desde: "2026-03-01",
      hasta: "2026-03-30",
    });
  });
});

describe("generateMedicalReport", () => {
  const report = generateMedicalReport({
    desde: "2026-03-01",
    hasta: "2026-03-31",
    hoy: "2026-03-31",
    profile,
    periods,
    dailyLogs,
    exerciseLogs,
    mealLogs,
  });

  it("resume el ciclo y su regularidad", () => {
    expect(report.ciclo.longitudPromedio).toBe(28);
    expect(report.ciclo.regularidad).toBe("Regular");
    expect(report.ciclo.ciclosRegistrados).toBe(3);
  });

  it("calcula la duración de menstruación promedio del rango", () => {
    // Sólo el periodo del 26 de marzo cae en el rango: 5 días.
    expect(report.ciclo.duracionMenstruacionPromedio).toBe(5);
  });

  it("ordena los síntomas recurrentes por frecuencia", () => {
    expect(report.sintomasRecurrentes[0].sintoma).toBe("colicos");
    expect(report.sintomasRecurrentes[0].conteo).toBe(3);
  });

  it("calcula adherencia al ejercicio", () => {
    expect(report.adherenciaEjercicio.completados).toBe(2);
    expect(report.adherenciaEjercicio.asignados).toBe(3);
    expect(report.adherenciaEjercicio.porcentaje).toBe(67);
  });

  it("señala el síntoma más recurrente en observaciones", () => {
    expect(report.observaciones.join(" ")).toContain("colicos");
  });

  it("se renderiza a texto plano compartible", () => {
    const txt = reportToText(report);
    expect(txt).toContain("INFORME DE SALUD CÍCLICA");
    expect(txt).toContain("Ana");
    expect(txt).toContain("colicos");
  });
});
