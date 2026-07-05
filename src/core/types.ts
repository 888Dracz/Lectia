// ---------------------------------------------------------------------------
// Tipos del dominio — modelo de datos central (ver §6 de la especificación).
// Todo el núcleo es puro y agnóstico de framework: no importa React ni el DOM.
// ---------------------------------------------------------------------------

/** Las 4 fases del ciclo menstrual. Es el "dato" que exportan los módulos. */
export type CyclePhase = "menstrual" | "folicular" | "ovulatoria" | "lutea";

/** Intensidad de una rutina de ejercicio, ordenada de menor a mayor. */
export type Intensity = "descanso" | "baja" | "moderada" | "alta" | "maxima";

/** Tipo de rutina de ejercicio. */
export type ExerciseType =
  | "movilidad"
  | "yoga"
  | "caminata"
  | "cardio"
  | "fuerza"
  | "hiit"
  | "descanso_activo";

/** Categoría del banco de consejos. */
export type TipCategory = "motivacional" | "nutricional" | "ejercicio" | "ciclo";

/** Objetivo de la usuaria. */
export type Goal = "perdida_peso" | "tono" | "rendimiento" | "mantenimiento";

/** Nivel de experiencia de la usuaria. */
export type Level = "principiante" | "intermedio" | "avanzado";

/** Estado de ánimo en escala 1 (muy bajo) a 5 (muy alto). */
export type MoodScore = 1 | 2 | 3 | 4 | 5;

/** Síntoma físico registrado. */
export type Symptom =
  | "colicos"
  | "hinchazon"
  | "dolor_cabeza"
  | "sensibilidad"
  | "fatiga"
  | "antojos";

/** Nivel de flujo (opcional). */
export type FlowLevel = "ligero" | "normal" | "abundante";

/** Fecha en formato ISO `YYYY-MM-DD` (sin hora, para comparaciones estables). */
export type IsoDate = string;

// --------------------------- Entidades -------------------------------------

/** Perfil de la usuaria (§6 Usuario). */
export interface UserProfile {
  nombre?: string;
  nivel: Level;
  objetivo: Goal;
  restricciones: string[];
  /** Duración de menstruación por defecto, en días. */
  duracionMenstruacion: number;
  /** Duración de ciclo por defecto usada hasta tener histórico suficiente. */
  duracionCicloPorDefecto: number;
}

/** Un ciclo registrado: fecha de inicio de menstruación (§6 RegistroCiclo). */
export interface PeriodRecord {
  inicio: IsoDate;
  /** Fin de menstruación, si se conoce. */
  fin?: IsoDate;
  flujo?: FlowLevel;
}

/** Registro diario de ánimo y síntomas (§6 RegistroAnimo). */
export interface DailyLog {
  fecha: IsoDate;
  animo?: MoodScore;
  sintomas: Symptom[];
  notas?: string;
}

/** Registro de ejercicio realizado (§6 RegistroEjercicio). */
export interface ExerciseLog {
  fecha: IsoDate;
  tipo: ExerciseType;
  completado: boolean;
}

/** Registro de comida (§6 RegistroComida). */
export interface MealLog {
  fecha: IsoDate;
  descripcion: string;
  calorias?: number;
}

/**
 * Objeto diario que exporta el motor de fases hacia los demás módulos.
 * Es el contrato de integración descrito en §2 y §5.
 */
export interface DaySnapshot {
  fecha: IsoDate;
  faseCiclo: CyclePhase;
  diaDelCiclo: number;
  /** Longitud de ciclo usada para clasificar este día. */
  longitudCiclo: number;
  /** `true` si la fase proviene de predicción histórica confiable. */
  prediccionConfiable: boolean;
  estadoAnimo?: MoodScore;
  sintomas: Symptom[];
}

/** Recomendación de ejercicio para un día (salida del módulo 2). */
export interface ExerciseRecommendation {
  fase: CyclePhase;
  tipo: ExerciseType;
  intensidad: Intensity;
  duracionMin: number;
  titulo: string;
  descripcion: string;
  /** `true` si el estado de ánimo bajó la intensidad respecto a la de fase. */
  ajustadoPorAnimo: boolean;
}

/** Recomendación nutricional para un día (salida del módulo 3). */
export interface NutritionRecommendation {
  fase: CyclePhase;
  enfoque: string;
  nutrientesClave: string[];
  alimentosSugeridos: string[];
  evitar: string[];
  consejo: string;
}

/** Un consejo del banco de contenido (§6 BancoDeConsejos). */
export interface Tip {
  texto: string;
  categoria: TipCategory;
  /** Fase asociada, si el consejo es específico de una fase. */
  fase?: CyclePhase;
  fuente?: string;
}
