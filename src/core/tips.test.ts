import { describe, expect, it } from "vitest";
import { tipForDay, tipsForPhase } from "./tips";
import { buildDailyAlarm, buildCalendarIcs } from "./notifications";
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

describe("tipForDay", () => {
  it("es determinista por fecha", () => {
    const a = tipForDay(snap({}));
    const b = tipForDay(snap({}));
    expect(a.texto).toBe(b.texto);
  });

  it("da una frase de contención con ánimo bajo", () => {
    const t = tipForDay(snap({ estadoAnimo: 1 }));
    expect(t.categoria).toBe("motivacional");
  });

  it("prefiere consejos de la fase actual", () => {
    const t = tipForDay(snap({ faseCiclo: "menstrual", fecha: "2026-03-02" }));
    // Puede ser de fase menstrual o general; si es de fase, debe coincidir.
    if (t.fase) expect(t.fase).toBe("menstrual");
  });
});

describe("tipsForPhase", () => {
  it("devuelve sólo consejos de la fase pedida", () => {
    const t = tipsForPhase("lutea");
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((x) => x.fase === "lutea")).toBe(true);
  });
});

describe("buildDailyAlarm", () => {
  it("compone titulo, rutina, nutricion y consejo por fase", () => {
    const alarm = buildDailyAlarm(snap({ faseCiclo: "ovulatoria" }));
    expect(alarm.titulo.toLowerCase()).toContain("energía");
    expect(alarm.rutina.length).toBeGreaterThan(0);
    expect(alarm.nutricion.length).toBeGreaterThan(0);
    expect(alarm.consejo.length).toBeGreaterThan(0);
  });
});

describe("buildCalendarIcs", () => {
  it("genera un VCALENDAR con un VEVENT por día", () => {
    const ics = buildCalendarIcs(
      [snap({ fecha: "2026-03-01" }), snap({ fecha: "2026-03-02" })],
      new Date("2026-03-01T08:00:00Z"),
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260301");
  });
});
