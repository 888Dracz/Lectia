import { describe, expect, it } from "vitest";
import { lowerIntensity, recommendExercise } from "./exercise";
import type { DaySnapshot } from "./types";

function snap(overrides: Partial<DaySnapshot>): DaySnapshot {
  return {
    fecha: "2026-03-01",
    faseCiclo: "folicular",
    diaDelCiclo: 8,
    longitudCiclo: 28,
    prediccionConfiable: true,
    sintomas: [],
    ...overrides,
  };
}

describe("lowerIntensity", () => {
  it("baja un nivel", () => {
    expect(lowerIntensity("maxima")).toBe("alta");
    expect(lowerIntensity("alta")).toBe("moderada");
  });
  it("no baja de descanso", () => {
    expect(lowerIntensity("descanso")).toBe("descanso");
  });
});

describe("recommendExercise", () => {
  it("recomienda alta intensidad en folicular", () => {
    const rec = recommendExercise(snap({ faseCiclo: "folicular" }));
    expect(rec.intensidad).toBe("alta");
    expect(rec.tipo).toBe("fuerza");
    expect(rec.ajustadoPorAnimo).toBe(false);
  });

  it("recomienda máxima intensidad en ovulatoria", () => {
    expect(recommendExercise(snap({ faseCiclo: "ovulatoria" })).intensidad).toBe(
      "maxima",
    );
  });

  it("recomienda baja intensidad en menstrual", () => {
    expect(recommendExercise(snap({ faseCiclo: "menstrual" })).intensidad).toBe(
      "baja",
    );
  });

  it("el ánimo bajo SOBRESCRIBE la recomendación de fase", () => {
    const normal = recommendExercise(snap({ faseCiclo: "ovulatoria" }));
    const bajo = recommendExercise(snap({ faseCiclo: "ovulatoria", estadoAnimo: 1 }));
    expect(normal.intensidad).toBe("maxima");
    expect(bajo.intensidad).toBe("alta"); // un nivel menos
    expect(bajo.ajustadoPorAnimo).toBe(true);
    expect(bajo.duracionMin).toBeLessThan(normal.duracionMin);
  });

  it("un ánimo neutral o alto no altera la fase", () => {
    const rec = recommendExercise(snap({ faseCiclo: "folicular", estadoAnimo: 4 }));
    expect(rec.ajustadoPorAnimo).toBe(false);
    expect(rec.intensidad).toBe("alta");
  });
});
