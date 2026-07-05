# Especificación Conceptual — App de Salud Integral (Ciclo + Ejercicio + Nutrición)

> Documento base a partir del cual se implementó Campanita. Ver el
> [README](../README.md) para el mapeo entre esta spec y el código.

## 1. Concepto general

La app es un **asistente de salud cíclico**: en lugar de tratar el ejercicio y
la alimentación como planes fijos, los ajusta dinámicamente según la fase del
ciclo menstrual y el estado de ánimo reportado por la usuaria. El ciclo
menstrual actúa como el "motor" central que alimenta a los otros dos módulos.

Referentes de mercado a tener en cuenta:
- **Clue / Flo**: trackers de ciclo menstrual con predicción por fases (menstrual, folicular, ovulación, lútea).
- **FitrWoman / Wild.AI**: adaptan entrenamiento a la fase del ciclo.
- **MyFitnessPal / Cronometer**: seguimiento nutricional con macros y patrones diarios.
- **Strava / Nike Training Club**: planificación y registro de rutinas de ejercicio.

## 2. Módulo 1 — Ciclo Menstrual (núcleo del sistema)

Captura fecha de inicio/fin de menstruación, duración promedio del ciclo
(mínimo 3 ciclos para predicción confiable), síntomas físicos, estado de ánimo
diario (escala 1–5), flujo y notas de fertilidad opcionales.

El sistema clasifica cada día del ciclo en una de 4 fases usando la duración
histórica. Salida hacia otros módulos:

```
{ fecha, fase_ciclo, dia_del_ciclo, estado_animo, sintomas[] }
```

## 3. Módulo 2 — Planificación Deportiva

| Fase | Recomendación de entrenamiento |
|---|---|
| Menstrual | Baja intensidad, movilidad, yoga, caminatas |
| Folicular | Alta intensidad permitida, buen momento para fuerza y metas nuevas |
| Ovulatoria | Pico de energía, entrenamientos de máxima exigencia |
| Lútea | Intensidad moderada-decreciente, más cardio suave y recuperación |

Si el estado de ánimo del día es bajo, el sistema sugiere una rutina más suave
que la que tocaría "por calendario": el ánimo **sobrescribe** la recomendación
por fase.

## 4. Módulo 3 — Planificación Alimenticia

| Fase | Enfoque nutricional sugerido |
|---|---|
| Menstrual | Hierro, magnesio, alimentos antiinflamatorios |
| Folicular | Proteína para apoyar entrenamiento intenso, carbohidratos complejos |
| Ovulatoria | Antioxidantes, fibra, buena hidratación |
| Lútea | Control de antojos de azúcar, más fibra y grasas saludables |

## 5. Capa de integración

1. Motor central de fase de ciclo que alimenta ejercicio y nutrición.
2. Sincronización con calendario del dispositivo (rutinas como eventos).
3. Alarma por fase con contenido cambiante.
4. Notas de estado de ánimo (mini-diario).
5. Consejos diarios / frases con alarma.
6. Informe médico automático (mensual/trimestral).
7. Estadística: dashboard de tendencias.

## 6. Modelo de datos (entidades principales)

Usuario, RegistroCiclo, RegistroAnimo, RutinaEjercicio, RegistroEjercicio,
PlanAlimenticio, RegistroComida, Alarma/Notificación, InformeMedico,
BancoDeConsejos.

## 7. Flujo de usuario típico

1. La app calcula la fase del ciclo del día.
2. Envía una alarma matutina con rutina + consejo.
3. La usuaria registra su estado de ánimo.
4. Si el ánimo es bajo, se ajusta la intensidad de la rutina.
5. La app sugiere enfoque nutricional según la fase.
6. La usuaria marca ejercicio/comidas completados.
7. Al cierre de mes se genera el informe y las estadísticas.

## 8. Consideraciones técnicas

- Mobile-first (app nativa o híbrida por alarmas/notificaciones push).
- Motor de predicción de ciclo simple basado en promedios históricos.
- Integración con calendario del dispositivo.
- Notificaciones push condicionadas por fase + ánimo.
- Base de datos relacional simple para v1.
- Posible v2: conexión con wearables.
