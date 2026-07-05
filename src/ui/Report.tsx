import { useMemo, useState } from "react";
import {
  addDays,
  buildCalendarIcs,
  buildSnapshot,
  generateMedicalReport,
  monthlyRange,
  reportToText,
  todayIso,
} from "../core";
import { useAppStore } from "../store/useAppStore";

/** Descarga un archivo de texto en el navegador. */
function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Report() {
  const { state } = useAppStore();
  const hoy = todayIso();
  const [visible, setVisible] = useState(false);

  const rango = monthlyRange(hoy);
  const report = useMemo(
    () =>
      generateMedicalReport({
        desde: rango.desde,
        hasta: rango.hasta,
        hoy,
        profile: state.profile,
        periods: state.periods,
        dailyLogs: state.dailyLogs,
        exerciseLogs: state.exerciseLogs,
        mealLogs: state.mealLogs,
      }),
    [rango.desde, rango.hasta, hoy, state],
  );

  const texto = useMemo(() => reportToText(report), [report]);

  function exportCalendar() {
    // Rutinas de los próximos 14 días como eventos .ics.
    const snaps = Array.from({ length: 14 }, (_, i) =>
      buildSnapshot(addDays(hoy, i), state.periods, state.profile),
    );
    download("campanita-rutinas.ics", buildCalendarIcs(snaps), "text/calendar");
  }

  return (
    <div>
      <div className="card">
        <p className="eyebrow">📄 Informe médico</p>
        <p className="muted" style={{ marginTop: 0 }}>
          Reporte de los últimos 30 días ({rango.desde} → {rango.hasta}) con
          patrones de ciclo, síntomas, ánimo y adherencia. Pensado para
          compartir con tu médico o nutricionista.
        </p>
        <div className="btn-row">
          <button className="btn" onClick={() => setVisible((v) => !v)}>
            {visible ? "Ocultar informe" : "Generar informe"}
          </button>
          <button
            className="btn ghost"
            onClick={() => download("informe-campanita.txt", texto, "text/plain")}
          >
            Exportar
          </button>
        </div>
      </div>

      {visible && (
        <div className="card">
          <div className="metric-grid" style={{ marginBottom: 12 }}>
            <div className="metric">
              <div className="num">{report.ciclo.longitudPromedio}d</div>
              <div className="lbl">Ciclo · {report.ciclo.regularidad}</div>
            </div>
            <div className="metric">
              <div className="num">{report.adherenciaEjercicio.porcentaje}%</div>
              <div className="lbl">
                Ejercicio {report.adherenciaEjercicio.completados}/
                {report.adherenciaEjercicio.asignados}
              </div>
            </div>
          </div>

          <p className="eyebrow">Observaciones</p>
          {report.observaciones.map((o, i) => (
            <p key={i} style={{ margin: "0 0 8px", fontSize: 13.5 }}>
              • {o}
            </p>
          ))}

          <p className="eyebrow" style={{ marginTop: 12 }}>Texto completo</p>
          <pre className="report">{texto}</pre>
        </div>
      )}

      {/* Sincronización con calendario */}
      <div className="card">
        <p className="eyebrow">🗓️ Sincronizar con tu calendario</p>
        <p className="muted" style={{ marginTop: 0 }}>
          Exportá las rutinas sugeridas de los próximos 14 días como archivo
          .ics para agregarlas a Google Calendar o Apple Calendar.
        </p>
        <button className="btn secondary" onClick={exportCalendar}>
          Descargar rutinas (.ics)
        </button>
      </div>
    </div>
  );
}
