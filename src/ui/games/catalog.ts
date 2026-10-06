import type { GameId } from "../../store/state";

export interface GameInfo {
  id: GameId;
  title: string;
  short: string;
  description: string;
  emoji: string;
  gradient: string;
  bestLabel: (best: number) => string;
}

export const GAMES: GameInfo[] = [
  {
    id: "rsvp",
    title: "Lectura rápida",
    short: "Palabra a palabra, a tu ritmo",
    description: "Las palabras aparecen una a una en el centro. Sin mover los ojos, lees mucho más rápido.",
    emoji: "⚡",
    gradient: "linear-gradient(135deg, #f2b544 0%, #f07b3f 100%)",
    bestLabel: (b) => (b ? `Récord: ${b} ppm` : "Sin récord aún"),
  },
  {
    id: "speedtest",
    title: "Test de velocidad",
    short: "¿Cuántas palabras por minuto lees?",
    description: "Lee un fragmento a tu ritmo normal y responde 3 preguntas para medir velocidad y comprensión.",
    emoji: "⏱️",
    gradient: "linear-gradient(135deg, #6a8dff 0%, #9b6bff 100%)",
    bestLabel: (b) => (b ? `Récord: ${b} ppm efectivas` : "Sin récord aún"),
  },
  {
    id: "cloze",
    title: "Palabra perdida",
    short: "Completa la frase",
    description: "Falta una palabra en cada frase. Elige la correcta lo más rápido que puedas.",
    emoji: "🧩",
    gradient: "linear-gradient(135deg, #2bc0a4 0%, #2a7de1 100%)",
    bestLabel: (b) => (b ? `Récord: ${b} pts` : "Sin récord aún"),
  },
  {
    id: "scramble",
    title: "Ordena la frase",
    short: "Reconstruye la oración",
    description: "Las palabras están desordenadas. Tócalas en el orden correcto para rearmar la frase.",
    emoji: "🔀",
    gradient: "linear-gradient(135deg, #ff7aa2 0%, #c86bff 100%)",
    bestLabel: (b) => (b ? `Récord: ${b} pts` : "Sin récord aún"),
  },
  {
    id: "flash",
    title: "Destello",
    short: "Amplía tu campo visual",
    description: "Una frase aparece por un instante. ¿Cuál era? Cada acierto la muestra aún más rápido.",
    emoji: "✨",
    gradient: "linear-gradient(135deg, #ffb347 0%, #ff5f6d 100%)",
    bestLabel: (b) => (b ? `Récord: ${b} pts` : "Sin récord aún"),
  },
  {
    id: "schulte",
    title: "Tabla de Schulte",
    short: "Visión periférica",
    description: "Toca los números del 1 al 25 en orden, mirando siempre al centro de la tabla.",
    emoji: "🔢",
    gradient: "linear-gradient(135deg, #43cea2 0%, #185a9d 100%)",
    bestLabel: (b) => (b ? `Mejor tiempo: ${((1000 - b) / 10).toFixed(1)} s` : "Sin récord aún"),
  },
];

export function gameInfo(id: string): GameInfo | undefined {
  return GAMES.find((g) => g.id === id);
}
