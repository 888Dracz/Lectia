# 🔔 Campanita — Asistente de salud cíclica

Campanita es un **asistente de salud cíclico**: en lugar de tratar el ejercicio
y la alimentación como planes fijos, los ajusta dinámicamente según la **fase
del ciclo menstrual** y el **estado de ánimo** reportado por la usuaria. El
ciclo menstrual actúa como el motor central que alimenta a los otros dos
módulos.

Esta es una implementación **v1 funcional** (web app mobile-first) de la
[especificación conceptual](docs/ESPECIFICACION.md).

## ✨ Qué hace

| Módulo | Descripción |
|---|---|
| **Ciclo (núcleo)** | Estima la duración del ciclo desde el histórico y clasifica cada día en una de 4 fases (menstrual, folicular, ovulatoria, lútea). |
| **Ejercicio** | Recomienda rutina e intensidad según la fase. **El ánimo bajo sobrescribe la recomendación** y suaviza la rutina del día. |
| **Nutrición** | Traduce la fase en un enfoque nutricional con nutrientes clave y alimentos sugeridos. |
| **Ánimo / síntomas** | Mini-diario diario (escala 1–5 + síntomas) que retroalimenta ejercicio y consejos. |
| **Alarma + consejos** | Contenido diario que cambia según fase y ánimo, con banco de frases motivacionales. |
| **Calendario** | Exporta las rutinas sugeridas como archivo `.ics` para Google/Apple Calendar. |
| **Informe médico** | Reporte automático de 30 días con patrones de ciclo, síntomas, ánimo por fase y adherencia, exportable a texto. |
| **Estadísticas** | Dashboard con regularidad del ciclo, adherencia, ánimo por fase y síntomas recurrentes. |

## 🏗️ Arquitectura

El código separa un **núcleo de dominio puro** (sin React ni DOM) de la capa de
UI, de modo que toda la lógica de negocio es testeable de forma aislada.

```
src/
  core/            # Núcleo de dominio — puro y con tests unitarios
    types.ts         # Modelo de datos (entidades de §6 de la spec)
    date.ts          # Utilidades de fecha (ISO, UTC-safe)
    cycle.ts         # Motor de fases: estimación + clasificación (Módulo 1)
    exercise.ts      # Recomendación de ejercicio + override por ánimo (Módulo 2)
    nutrition.ts     # Recomendación nutricional por fase (Módulo 3)
    tips.ts          # Banco de consejos filtrado por fase/ánimo
    stats.ts         # Estadísticas y tendencias
    report.ts        # Generación del informe médico
    notifications.ts # Alarma diaria + exportación de calendario (.ics)
    *.test.ts        # 40 tests unitarios (vitest)
  store/           # Estado de la app (useReducer) + persistencia localStorage
  ui/              # Componentes React por pantalla
  App.tsx          # Shell con navegación por pestañas
```

### El motor de fases

La ovulación se ubica ~14 días antes del siguiente periodo (la fase lútea es la
más constante). A partir de la longitud estimada del ciclo `L`:

- **Menstrual**: días `1 … duraciónMenstruación`
- **Folicular**: hasta la ventana ovulatoria
- **Ovulatoria**: ventana de ~3 días alrededor del día `L − 14`
- **Lútea**: desde la ovulación hasta el fin del ciclo

La estimación se considera **confiable** con 3+ ciclos completos registrados;
antes usa la duración por defecto del perfil e indica que es preliminar.

## 🚀 Desarrollo

Requiere Node 20+.

```bash
npm install
npm run dev        # servidor de desarrollo (Vite)
npm test           # tests unitarios del núcleo (vitest)
npm run build      # typecheck + build de producción
npm run preview    # sirve el build de producción
```

Los datos se guardan **solo en el dispositivo** (localStorage). La app arranca
con datos de demostración; desde *Perfil* se pueden recargar o borrar.

## 🧭 Estado y próximos pasos

Esta v1 cubre los 3 módulos y la capa de integración con datos locales. La
[especificación](docs/ESPECIFICACION.md) contempla para futuras versiones:
notificaciones push nativas, sincronización directa con el calendario del
dispositivo (aquí resuelto vía export `.ics`) y conexión con wearables.

> Campanita no reemplaza el consejo médico profesional.
