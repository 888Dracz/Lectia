import { describe, expect, it } from "vitest";
import { recommendNutrition } from "./nutrition";
import type { DaySnapshot } from "./types";

function snap(overrides: Partial<DaySnapshot>): DaySnapshot {
  return {
    fecha: "2026-03-01",
    faseCiclo: "menstrual",
    diaDelCiclo: 2,
    longitudCiclo: 28,
    prediccionConfiable: true,
    sintomas: [],
    ...overrides,
  };
}

describe("recommendNutrition", () => {
  it("prioriza hierro y magnesio en menstrual", () => {
    const rec = recommendNutrition(snap({ faseCiclo: "menstrual" }));
    expect(rec.nutrientesClave).toContain("hierro");
    expect(rec.nutrientesClave).toContain("magnesio");
  });

  it("prioriza proteína en folicular", () => {
    expect(recommendNutrition(snap({ faseCiclo: "folicular" })).nutrientesClave).toContain(
      "proteína",
    );
  });

  it("enfoca control de antojos en lútea", () => {
    expect(recommendNutrition(snap({ faseCiclo: "lutea" })).enfoque.toLowerCase()).toContain(
      "antojos",
    );
  });

  it("refuerza el consejo cuando hay antojos registrados", () => {
    const base = recommendNutrition(snap({ faseCiclo: "lutea" }));
    const conAntojos = recommendNutrition(
      snap({ faseCiclo: "lutea", sintomas: ["antojos"] }),
    );
    expect(conAntojos.consejo.length).toBeGreaterThan(base.consejo.length);
    expect(conAntojos.consejo).toContain("antojos");
  });
});
