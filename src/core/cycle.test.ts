import { describe, expect, it } from "vitest";
import {
  DEFAULT_CYCLE_LENGTH,
  buildSnapshot,
  classifyPhase,
  dayOfCycle,
  estimateCycleLength,
  predictNextPeriod,
} from "./cycle";
import type { PeriodRecord, UserProfile } from "./types";

const profile: Pick<UserProfile, "duracionMenstruacion" | "duracionCicloPorDefecto"> = {
  duracionMenstruacion: 5,
  duracionCicloPorDefecto: 28,
};

// Periodos cada 28 días exactos.
const periods28: PeriodRecord[] = [
  { inicio: "2026-01-01" },
  { inicio: "2026-01-29" },
  { inicio: "2026-02-26" },
  { inicio: "2026-03-26" },
];

describe("estimateCycleLength", () => {
  it("promedia los intervalos plausibles", () => {
    const est = estimateCycleLength(periods28);
    expect(est.longitud).toBe(28);
    expect(est.confiable).toBe(true);
    expect(est.intervalosValidos).toEqual([28, 28, 28]);
    expect(est.desviacion).toBe(0);
  });

  it("no es confiable con menos de 3 intervalos", () => {
    const est = estimateCycleLength([
      { inicio: "2026-01-01" },
      { inicio: "2026-01-29" },
    ]);
    expect(est.confiable).toBe(false);
  });

  it("usa el fallback sin registros", () => {
    const est = estimateCycleLength([], 30);
    expect(est.longitud).toBe(30);
    expect(est.confiable).toBe(false);
  });

  it("descarta intervalos implausibles (registros olvidados)", () => {
    const est = estimateCycleLength([
      { inicio: "2026-01-01" },
      { inicio: "2026-01-29" }, // 28
      { inicio: "2026-05-01" }, // 92 -> descartado
      { inicio: "2026-05-29" }, // 28
    ]);
    expect(est.intervalosValidos).toEqual([28, 28]);
    expect(est.longitud).toBe(28);
  });
});

describe("dayOfCycle", () => {
  it("es 1-based en el ancla", () => {
    expect(dayOfCycle("2026-01-01", "2026-01-01", 28)).toBe(1);
  });

  it("cuenta días desde el ancla", () => {
    expect(dayOfCycle("2026-01-10", "2026-01-01", 28)).toBe(10);
  });

  it("envuelve al superar la longitud del ciclo", () => {
    // 30 días después de un ciclo de 28 => día 3.
    expect(dayOfCycle("2026-01-31", "2026-01-01", 28)).toBe(3);
  });
});

describe("classifyPhase", () => {
  it("clasifica las 4 fases de un ciclo de 28 días", () => {
    expect(classifyPhase(1, 28, 5)).toBe("menstrual");
    expect(classifyPhase(5, 28, 5)).toBe("menstrual");
    expect(classifyPhase(6, 28, 5)).toBe("folicular");
    expect(classifyPhase(12, 28, 5)).toBe("folicular");
    // Ovulación ~ día 14 (28-14), ventana 13-15.
    expect(classifyPhase(14, 28, 5)).toBe("ovulatoria");
    expect(classifyPhase(16, 28, 5)).toBe("lutea");
    expect(classifyPhase(28, 28, 5)).toBe("lutea");
  });

  it("mantiene fases bien ordenadas en ciclos cortos", () => {
    // Con un ciclo corto no debe haber solapes ni excepciones.
    const fases = Array.from({ length: 21 }, (_, i) => classifyPhase(i + 1, 21, 4));
    expect(fases[0]).toBe("menstrual");
    expect(fases[20]).toBe("lutea");
    // Debe existir al menos un día ovulatorio.
    expect(fases).toContain("ovulatoria");
  });
});

describe("buildSnapshot", () => {
  it("produce el contrato de integración con fase y día", () => {
    const snap = buildSnapshot("2026-03-28", periods28, profile);
    // 2 días después del inicio del 26 de marzo => día 3, menstrual.
    expect(snap.diaDelCiclo).toBe(3);
    expect(snap.faseCiclo).toBe("menstrual");
    expect(snap.longitudCiclo).toBe(28);
    expect(snap.prediccionConfiable).toBe(true);
  });

  it("proyecta hacia adelante si el último registro es antiguo", () => {
    // 30 días tras el último inicio => día 3 del siguiente ciclo proyectado.
    const snap = buildSnapshot("2026-04-25", periods28, profile);
    expect(snap.diaDelCiclo).toBe(31 - 28); // 30 días -> día 3
    expect(snap.faseCiclo).toBe("menstrual");
  });

  it("marca no confiable sin registros de menstruación", () => {
    const snap = buildSnapshot("2026-03-28", [], profile);
    expect(snap.prediccionConfiable).toBe(false);
    expect(snap.diaDelCiclo).toBe(1);
  });

  it("incluye ánimo y síntomas del registro diario", () => {
    const snap = buildSnapshot("2026-03-28", periods28, profile, {
      fecha: "2026-03-28",
      animo: 2,
      sintomas: ["colicos"],
    });
    expect(snap.estadoAnimo).toBe(2);
    expect(snap.sintomas).toEqual(["colicos"]);
  });
});

describe("predictNextPeriod", () => {
  it("suma la longitud al último inicio", () => {
    const next = predictNextPeriod(periods28);
    expect(next).not.toBeNull();
    expect(next?.fecha).toBe("2026-04-23"); // 26 mar + 28
    expect(next?.confiable).toBe(true);
  });

  it("devuelve null sin histórico", () => {
    expect(predictNextPeriod([])).toBeNull();
  });

  it("usa el fallback con un único registro", () => {
    const next = predictNextPeriod([{ inicio: "2026-01-01" }], DEFAULT_CYCLE_LENGTH);
    expect(next?.fecha).toBe("2026-01-29");
    expect(next?.confiable).toBe(false);
  });
});
