import type {
  CyclePhase,
  DaySnapshot,
  NutritionRecommendation,
} from "./types";

// ---------------------------------------------------------------------------
// Módulo 3 — Planificación alimenticia (§4).
//
// Traduce la fase del ciclo en "Consejos de Alimentación": nutrientes clave,
// alimentos sugeridos y qué controlar. Los antojos/síntomas afinan el consejo.
// ---------------------------------------------------------------------------

const PHASE_NUTRITION: Record<CyclePhase, NutritionRecommendation> = {
  menstrual: {
    fase: "menstrual",
    enfoque: "Hierro, magnesio y alimentos antiinflamatorios",
    nutrientesClave: ["hierro", "magnesio", "omega-3", "vitamina C"],
    alimentosSugeridos: [
      "espinaca y legumbres",
      "chocolate amargo",
      "pescado azul",
      "frutos secos",
    ],
    evitar: ["exceso de sal", "cafeína en exceso"],
    consejo:
      "Reponé hierro y magnesio para el cansancio típico del periodo. La vitamina C ayuda a absorber el hierro.",
  },
  folicular: {
    fase: "folicular",
    enfoque: "Proteína y carbohidratos complejos para el entrenamiento intenso",
    nutrientesClave: ["proteína", "carbohidratos complejos", "vitaminas B"],
    alimentosSugeridos: [
      "huevo y yogur",
      "avena y quinoa",
      "pollo o tofu",
      "verduras de hoja",
    ],
    evitar: ["azúcares simples antes de entrenar"],
    consejo:
      "Tu energía sube: aprovechá con proteína para construir músculo y carbohidratos complejos para rendir.",
  },
  ovulatoria: {
    fase: "ovulatoria",
    enfoque: "Antioxidantes, fibra e hidratación",
    nutrientesClave: ["antioxidantes", "fibra", "agua", "zinc"],
    alimentosSugeridos: [
      "frutos rojos",
      "verduras crucíferas",
      "semillas",
      "abundante agua",
    ],
    evitar: ["comidas muy pesadas"],
    consejo:
      "Priorizá antioxidantes y fibra, y mantené buena hidratación para acompañar tu pico de energía.",
  },
  lutea: {
    fase: "lutea",
    enfoque: "Control de antojos de azúcar; fibra y grasas saludables",
    nutrientesClave: ["fibra", "grasas saludables", "magnesio", "triptófano"],
    alimentosSugeridos: [
      "palta y frutos secos",
      "batata y granos integrales",
      "banana",
      "chocolate amargo (con medida)",
    ],
    evitar: ["azúcar refinada", "ultraprocesados"],
    consejo:
      "Los antojos de azúcar son normales ahora. Elegí grasas saludables y fibra para saciarte más tiempo.",
  },
};

/**
 * Recomienda el enfoque nutricional del día según la fase.
 * Si hay antojos registrados, refuerza el consejo de saciedad.
 */
export function recommendNutrition(
  snapshot: DaySnapshot,
): NutritionRecommendation {
  const base = PHASE_NUTRITION[snapshot.faseCiclo];
  if (snapshot.sintomas.includes("antojos")) {
    return {
      ...base,
      consejo:
        base.consejo +
        " Registrás antojos hoy: sumá proteína o fibra a la siguiente comida para cortarlos.",
    };
  }
  return base;
}
