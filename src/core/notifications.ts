import { recommendExercise } from "./exercise";
import { recommendNutrition } from "./nutrition";
import { tipForDay } from "./tips";
import type { DaySnapshot } from "./types";

// ---------------------------------------------------------------------------
// Capa de integración (§5): alarma diaria por fase + exportación a calendario.
// ---------------------------------------------------------------------------

const PHASE_HEADLINE: Record<DaySnapshot["faseCiclo"], string> = {
  menstrual: "Hoy prioriza el descanso",
  folicular: "Buen día para alta intensidad",
  ovulatoria: "¡Estás en tu pico de energía!",
  lutea: "Bajá un cambio y cuidate",
};

export interface DailyAlarm {
  fecha: string;
  titulo: string;
  cuerpo: string;
  rutina: string;
  nutricion: string;
  consejo: string;
}

/**
 * Construye el contenido de la alarma matutina (§5.3): cambia según la fase
 * del ciclo y el estado de ánimo, e incluye rutina + enfoque nutricional +
 * consejo del día.
 */
export function buildDailyAlarm(snapshot: DaySnapshot): DailyAlarm {
  const ejercicio = recommendExercise(snapshot);
  const nutricion = recommendNutrition(snapshot);
  const consejo = tipForDay(snapshot);

  return {
    fecha: snapshot.fecha,
    titulo: `${PHASE_HEADLINE[snapshot.faseCiclo]} · Día ${snapshot.diaDelCiclo}`,
    cuerpo: `${ejercicio.titulo} — ${ejercicio.duracionMin} min`,
    rutina: `${ejercicio.titulo} (${ejercicio.intensidad}, ${ejercicio.duracionMin} min)`,
    nutricion: nutricion.enfoque,
    consejo: consejo.texto,
  };
}

function icsEscape(text: string): string {
  return text.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

function toIcsDate(iso: string): string {
  return iso.replace(/-/g, "");
}

/**
 * Genera un archivo .ics con las rutinas sugeridas como eventos de día
 * completo, para sincronizar con el calendario nativo del dispositivo (§5.2).
 */
export function buildCalendarIcs(
  snapshots: DaySnapshot[],
  now: Date = new Date(),
): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Campanita//Salud Ciclica//ES",
    "CALSCALE:GREGORIAN",
  ];

  for (const snap of snapshots) {
    const alarm = buildDailyAlarm(snap);
    const start = toIcsDate(snap.fecha);
    lines.push(
      "BEGIN:VEVENT",
      `UID:campanita-${snap.fecha}@campanita.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `SUMMARY:${icsEscape("🔔 " + alarm.rutina)}`,
      `DESCRIPTION:${icsEscape(
        `Fase: ${snap.faseCiclo}\nNutrición: ${alarm.nutricion}\nConsejo: ${alarm.consejo}`,
      )}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
