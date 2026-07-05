import type { CyclePhase, ExerciseType, Intensity, Symptom } from "../core";

export const PHASE_LABEL: Record<CyclePhase, string> = {
  menstrual: "Menstrual",
  folicular: "Folicular",
  ovulatoria: "Ovulatoria",
  lutea: "Lútea",
};

export const PHASE_EMOJI: Record<CyclePhase, string> = {
  menstrual: "🌙",
  folicular: "🌱",
  ovulatoria: "☀️",
  lutea: "🍂",
};

export const MOOD_EMOJI: Record<number, string> = {
  1: "😞",
  2: "🙁",
  3: "😐",
  4: "🙂",
  5: "😄",
};

export const INTENSITY_LABEL: Record<Intensity, string> = {
  descanso: "Descanso",
  baja: "Baja",
  moderada: "Moderada",
  alta: "Alta",
  maxima: "Máxima",
};

export const EXERCISE_LABEL: Record<ExerciseType, string> = {
  movilidad: "Movilidad",
  yoga: "Yoga",
  caminata: "Caminata",
  cardio: "Cardio",
  fuerza: "Fuerza",
  hiit: "HIIT",
  descanso_activo: "Descanso activo",
};

export const SYMPTOM_LABEL: Record<Symptom, string> = {
  colicos: "Cólicos",
  hinchazon: "Hinchazón",
  dolor_cabeza: "Dolor de cabeza",
  sensibilidad: "Sensibilidad",
  fatiga: "Fatiga",
  antojos: "Antojos",
};

export const ALL_SYMPTOMS: Symptom[] = [
  "colicos",
  "hinchazon",
  "dolor_cabeza",
  "sensibilidad",
  "fatiga",
  "antojos",
];

/** Formatea `YYYY-MM-DD` como "5 jul" en español. */
export function formatShort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const meses = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  return `${d} ${meses[m - 1]}`;
}
