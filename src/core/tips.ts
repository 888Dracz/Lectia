import type { CyclePhase, DaySnapshot, MoodScore, Tip } from "./types";
import { LOW_MOOD_THRESHOLD } from "./exercise";

// ---------------------------------------------------------------------------
// Banco de consejos / frases (§5.5, §6 BancoDeConsejos).
//
// Contenido motivacional y educativo que se dispara con la notificación
// diaria, filtrable por fase y por estado de ánimo.
// ---------------------------------------------------------------------------

export const TIPS: Tip[] = [
  // Consejos por fase
  {
    texto: "Descanso también es entrenamiento. Tu cuerpo se repara mientras baja el ritmo.",
    categoria: "ejercicio",
    fase: "menstrual",
  },
  {
    texto: "Un poco de magnesio (chocolate amargo, frutos secos) puede aliviar los cólicos.",
    categoria: "nutricional",
    fase: "menstrual",
  },
  {
    texto: "Fase folicular: es tu ventana para intentar un récord personal. ¡A por él!",
    categoria: "ejercicio",
    fase: "folicular",
  },
  {
    texto: "Con la energía en alza, la proteína rinde más. Sumala a cada comida.",
    categoria: "nutricional",
    fase: "folicular",
  },
  {
    texto: "Estás en tu pico de energía. Buen día para lo que venías postergando.",
    categoria: "motivacional",
    fase: "ovulatoria",
  },
  {
    texto: "Hidratarte bien hoy potencia tu rendimiento y tu concentración.",
    categoria: "nutricional",
    fase: "ovulatoria",
  },
  {
    texto: "Los antojos de la fase lútea son biología, no falta de voluntad. Elegí con cariño.",
    categoria: "nutricional",
    fase: "lutea",
  },
  {
    texto: "Bajá un cambio si lo necesitás. Constancia amable le gana a intensidad forzada.",
    categoria: "motivacional",
    fase: "lutea",
  },
  // Consejos generales (sin fase)
  {
    texto: "Escuchar a tu cuerpo no es rendirse, es entrenar con inteligencia.",
    categoria: "motivacional",
  },
  {
    texto: "El progreso no es lineal, y tu ciclo tampoco. Ambos avanzan.",
    categoria: "motivacional",
    fuente: "Campanita",
  },
  {
    texto: "Registrar tu ánimo un minuto al día te devuelve patrones que valen oro.",
    categoria: "ciclo",
  },
];

/** Frases de refuerzo específicas para un día de ánimo bajo. */
const LOW_MOOD_TIPS: Tip[] = [
  {
    texto: "Hoy alcanza con presentarte. Movés el cuerpo un poco y ya ganaste el día. 💛",
    categoria: "motivacional",
  },
  {
    texto: "Está bien tener un día bajo. Sé contigo tan amable como serías con una amiga.",
    categoria: "motivacional",
  },
];

/** Selección determinista basada en una semilla (p. ej. la fecha). */
function pickDeterministic<T>(items: T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % items.length;
  return items[idx];
}

/**
 * Elige el consejo del día. Prioriza:
 *  1. Si el ánimo es bajo → frase de contención.
 *  2. Consejos de la fase actual.
 *  3. Consejos generales.
 * La selección es determinista por fecha para que no cambie al recargar.
 */
export function tipForDay(snapshot: DaySnapshot): Tip {
  const animoBajo =
    snapshot.estadoAnimo !== undefined &&
    snapshot.estadoAnimo <= LOW_MOOD_THRESHOLD;
  if (animoBajo) {
    return pickDeterministic(LOW_MOOD_TIPS, snapshot.fecha);
  }

  const dePhase = TIPS.filter((t) => t.fase === snapshot.faseCiclo);
  const pool = dePhase.length > 0 ? dePhase : TIPS.filter((t) => !t.fase);
  return pickDeterministic(pool, snapshot.fecha);
}

/** Devuelve todos los consejos de una fase (para explorar el banco). */
export function tipsForPhase(fase: CyclePhase): Tip[] {
  return TIPS.filter((t) => t.fase === fase);
}

/** Etiqueta legible para un ánimo. */
export function moodLabel(mood: MoodScore): string {
  return (
    { 1: "Muy bajo", 2: "Bajo", 3: "Neutral", 4: "Bien", 5: "Con energía" } as const
  )[mood];
}
