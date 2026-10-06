import { Minus, Plus, Sun } from "lucide-react";
import { useState } from "react";
import type { BookMeta } from "../../books/types";
import { ALL_TOOLS, type ReaderSettings, type ToolId } from "../../store/state";
import { toast } from "../../store/ui";
import { requestMotionPermission } from "./hooks";
import { Range, Segmented, Switch } from "../components/controls";
import { Sheet } from "../components/Sheet";
import { READER_FONTS, READER_THEMES } from "./themes";

interface Props {
  open: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
  book: BookMeta;
  onPdfMode: (mode: "pages" | "text") => void;
  fixedLayout: boolean;
}

type Tab = "text" | "screen" | "focus" | "engine";

export const TOOL_LABEL: Record<ToolId, string> = {
  toc: "Índice",
  format: "Aspecto",
  night: "Día / Noche",
  tts: "Escuchar (voz)",
  rsvp: "Lectura rápida",
  select: "Seleccionar texto",
  search: "Buscar",
  autoscroll: "Desplazamiento automático",
  prevChapter: "Capítulo anterior",
  nextChapter: "Capítulo siguiente",
  prevFile: "Libro anterior",
  nextFile: "Libro siguiente",
  bookmark: "Marcador",
  brightness: "Brillo",
  fontSize: "Tamaño de letra",
  orientation: "Orientación",
  info: "Información del libro",
  edit: "Vista de edición",
};

function Toggle({ title, sub, on, onChange }: { title: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="list-item">
      <span className="li-main">
        <div className="li-title">{title}</div>
        {sub && <div className="li-sub">{sub}</div>}
      </span>
      <Switch on={on} onChange={onChange} />
    </div>
  );
}

export function FormatSheet(props: Props) {
  const [tab, setTab] = useState<Tab>("text");
  return (
    <Sheet open={props.open} onClose={props.onClose} title="Aspecto" noBackdropBlur>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "text", label: "Texto" },
          { value: "screen", label: "Pantalla" },
          { value: "focus", label: "Enfoque" },
          { value: "engine", label: "Motor" },
        ]}
      />
      <div style={{ height: 14 }} />
      {tab === "text" && <TextTab {...props} />}
      {tab === "screen" && <ScreenTab s={props.settings} onChange={props.onChange} />}
      {tab === "focus" && <FocusTab s={props.settings} onChange={props.onChange} />}
      {tab === "engine" && <EngineTab s={props.settings} onChange={props.onChange} />}
    </Sheet>
  );
}

function TextTab({ settings: s, onChange, book, onPdfMode, fixedLayout }: Props) {
  const isPdfPages = book.format === "pdf" && (book.pdfMode ?? "pages") === "pages";
  const textOptions = !isPdfPages && !fixedLayout;
  return (
    <>
      <div className="fmt-themes" role="radiogroup" aria-label="Tema de lectura">
        {READER_THEMES.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={s.theme === t.id}
            className={`theme-swatch ${s.theme === t.id ? "active" : ""}`}
            style={{ background: t.bg, color: t.fg }}
            onClick={() => onChange({ theme: t.id })}
          >
            <span className="sw-aa">Aa</span>
            <span className="sw-name">{t.name}</span>
          </button>
        ))}
        <button
          role="radio"
          aria-checked={s.theme === "custom"}
          className={`theme-swatch ${s.theme === "custom" ? "active" : ""}`}
          style={{ background: s.customTheme.bg, color: s.customTheme.fg }}
          onClick={() => onChange({ theme: "custom" })}
        >
          <span className="sw-aa">Aa</span>
          <span className="sw-name">Personal</span>
        </button>
      </div>
      {s.theme === "custom" && (
        <div className="custom-theme">
          {(["bg", "fg", "link"] as const).map((k) => (
            <label key={k} className="custom-color">
              <input type="color" value={s.customTheme[k]} onChange={(e) => onChange({ customTheme: { ...s.customTheme, [k]: e.target.value } })} />
              <span>{k === "bg" ? "Fondo" : k === "fg" ? "Texto" : "Enlaces"}</span>
            </label>
          ))}
          <label className="custom-color">
            <Switch on={s.customTheme.dark} onChange={(v) => onChange({ customTheme: { ...s.customTheme, dark: v } })} />
            <span>Oscuro</span>
          </label>
        </div>
      )}

      <div className="fmt-row">
        <Sun size={18} className="faint" />
        <Range value={s.brightness} min={0.15} max={1} step={0.01} onChange={(v) => onChange({ brightness: v })} label="Brillo" />
        <span className="fmt-val">{Math.round(s.brightness * 100)}%</span>
      </div>

      {book.format === "pdf" && (
        <>
          <div className="label">Ver el PDF como</div>
          <Segmented
            value={book.pdfMode ?? "pages"}
            onChange={onPdfMode}
            options={[
              { value: "pages", label: "Páginas originales" },
              { value: "text", label: "Texto adaptable" },
            ]}
          />
          {isPdfPages && (
            <>
              <div className="label">Zoom</div>
              <div className="fmt-row">
                <button className="icon-btn filled" onClick={() => onChange({ pdfZoom: Math.max(1, +(s.pdfZoom - 0.25).toFixed(2)) })} aria-label="Alejar">
                  <Minus size={18} />
                </button>
                <Range value={s.pdfZoom} min={1} max={4} step={0.05} onChange={(v) => onChange({ pdfZoom: v })} label="Zoom" />
                <button className="icon-btn filled" onClick={() => onChange({ pdfZoom: Math.min(4, +(s.pdfZoom + 0.25).toFixed(2)) })} aria-label="Acercar">
                  <Plus size={18} />
                </button>
              </div>
              <p className="faint fmt-note">También puedes pellizcar la página con dos dedos.</p>
            </>
          )}
        </>
      )}

      {textOptions && (
        <>
          <div className="label">Tamaño de letra</div>
          <div className="fmt-size">
            <button className="icon-btn filled" onClick={() => onChange({ fontSize: Math.max(12, s.fontSize - 1) })} aria-label="Letra más pequeña">
              <span style={{ fontSize: 14, fontWeight: 700 }}>A</span>
            </button>
            <Range value={s.fontSize} min={12} max={34} onChange={(v) => onChange({ fontSize: v })} label="Tamaño de letra" />
            <button className="icon-btn filled" onClick={() => onChange({ fontSize: Math.min(34, s.fontSize + 1) })} aria-label="Letra más grande">
              <span style={{ fontSize: 21, fontWeight: 700 }}>A</span>
            </button>
            <span className="fmt-val">{s.fontSize}</span>
          </div>

          <div className="label">Tipografía</div>
          <div className="chips fmt-fonts">
            {READER_FONTS.map((f) => (
              <button
                key={f.id}
                className={`chip ${s.font === f.id ? "active" : ""}`}
                style={{ fontFamily: f.css, fontSize: 15 }}
                onClick={() => onChange({ font: f.id })}
              >
                {f.name}
              </button>
            ))}
          </div>

          <div className="label">Interlineado</div>
          <div className="fmt-row">
            <Range value={s.lineHeight} min={1.15} max={2.3} step={0.05} onChange={(v) => onChange({ lineHeight: v })} label="Interlineado" />
            <span className="fmt-val">{s.lineHeight.toFixed(2)}</span>
          </div>

          <div className="label">Márgenes</div>
          <div className="fmt-row">
            <Range value={s.margin} min={6} max={56} onChange={(v) => onChange({ margin: v })} label="Márgenes" />
            <span className="fmt-val">{s.margin}</span>
          </div>

          <div className="label">Espacio entre párrafos</div>
          <div className="fmt-row">
            <Range value={s.paragraphSpacing} min={0} max={1.4} step={0.1} onChange={(v) => onChange({ paragraphSpacing: v })} label="Espacio entre párrafos" />
            <span className="fmt-val">{s.paragraphSpacing.toFixed(1)}</span>
          </div>

          <div className="label">Alineación</div>
          <Segmented
            value={s.align}
            onChange={(v) => onChange({ align: v })}
            options={[
              { value: "justify", label: "Justificado" },
              { value: "left", label: "Izquierda" },
            ]}
          />

          <div className="label">Modo de lectura</div>
          <Segmented
            value={s.allowScroll ? s.mode : "paged"}
            onChange={(v) => (v === "scroll" && !s.allowScroll ? toast("El desplazamiento vertical está desactivado (pestaña Pantalla)") : onChange({ mode: v }))}
            options={[
              { value: "paged", label: "Páginas" },
              { value: "scroll", label: "Desplazamiento" },
            ]}
          />
        </>
      )}

      <div className="list" style={{ marginTop: 18 }}>
        {textOptions && (
          <>
            <Toggle title="Sangría en la primera línea de cada párrafo" on={s.indent} onChange={(v) => onChange({ indent: v })} />
            <div className="list-item">
              <span className="li-main li-title">Separar sílabas al final de línea</span>
              <Switch on={s.hyphenate} onChange={(v) => onChange({ hyphenate: v })} />
            </div>
          </>
        )}
        {textOptions && (
          <>
            <Toggle title="Eliminar líneas vacías" on={s.cleanEmptyLines} onChange={(v) => onChange({ cleanEmptyLines: v })} />
            <Toggle title="Eliminar espacios dobles" sub="También los del inicio de cada párrafo" on={s.cleanSpaces} onChange={(v) => onChange({ cleanSpaces: v })} />
            <Toggle title="Recortar espacio superior" sub="Sin márgenes en blanco arriba al empezar página o capítulo" on={s.trimTop} onChange={(v) => onChange({ trimTop: v })} />
            <Toggle title="Páginas de la edición impresa" sub="Muestra el número de página real si el libro (EPUB) lo indica" on={s.printedPages} onChange={(v) => onChange({ printedPages: v })} />
          </>
        )}
      </div>
    </>
  );
}

type TabProps = { s: ReaderSettings; onChange: (p: Partial<ReaderSettings>) => void };

function ScreenTab({ s, onChange }: TabProps) {
  return (
    <>
      <div className="list">
        <Toggle title="Ocultar la barra de notificaciones" sub="Lectura a pantalla completa" on={s.fullscreen} onChange={(v) => onChange({ fullscreen: v })} />
        <Toggle title="Mantener la pantalla encendida" on={s.keepAwake} onChange={(v) => onChange({ keepAwake: v })} />
        <Toggle title="Barra de estado" on={s.showStatus} onChange={(v) => onChange({ showStatus: v })} />
        {s.showStatus && <Toggle title="Mini barra de estado" sub="Una línea fina con hora, avance y tiempo restante" on={s.miniStatus} onChange={(v) => onChange({ miniStatus: v })} />}
      </div>
      {s.showStatus && (
        <>
          <div className="label">Mostrar avance como</div>
          <Segmented
            value={s.progressDisplay}
            onChange={(v) => onChange({ progressDisplay: v })}
            options={[
              { value: "percent", label: "%" },
              { value: "page", label: "Página" },
              { value: "both", label: "Ambos" },
            ]}
          />
          <div className="label">Tiempo restante</div>
          <Segmented
            value={s.timeLeft}
            onChange={(v) => onChange({ timeLeft: v })}
            options={[
              { value: "off", label: "No" },
              { value: "chapter", label: "Capítulo" },
              { value: "book", label: "Libro" },
              { value: "both", label: "Ambos" },
            ]}
          />
        </>
      )}

      <div className="label">Pasar página</div>
      <div className="list">
        <Toggle title="Animación (deslizamiento horizontal)" on={s.animation === "slide"} onChange={(v) => onChange({ animation: v ? "slide" : "none" })} />
        <Toggle title="Permitir desplazamiento vertical" sub="Si lo apagas, siempre se lee por páginas" on={s.allowScroll} onChange={(v) => onChange({ allowScroll: v, ...(v ? {} : { mode: "paged" }) })} />
        <Toggle title="Tocar los bordes para pasar página" sub="Izquierda: atrás · Derecha: adelante" on={s.tapZones} onChange={(v) => onChange({ tapZones: v })} />
        <Toggle title="Sonido al pasar página" on={s.pageSound} onChange={(v) => onChange({ pageSound: v })} />
        {s.pageSound && (
          <div className="list-item col">
            <div className="li-title">Volumen · {Math.round(s.pageSoundVolume * 100)}%</div>
            <Range value={s.pageSoundVolume} min={0.05} max={1} step={0.05} onChange={(v) => onChange({ pageSoundVolume: v })} label="Volumen" />
          </div>
        )}
        <Toggle
          title="Pasar página inclinando el teléfono"
          sub="Inclina a la derecha para avanzar y a la izquierda para volver"
          on={s.tiltPaging}
          onChange={async (v) => {
            if (v && !(await requestMotionPermission())) {
              toast("No hay permiso para usar los sensores de movimiento", { tone: "error" });
              return;
            }
            onChange({ tiltPaging: v });
          }}
        />
        {s.tiltPaging && (
          <div className="list-item col">
            <div className="li-title">Inclinación necesaria · {s.tiltThreshold}°</div>
            <Range value={s.tiltThreshold} min={10} max={45} onChange={(v) => onChange({ tiltThreshold: v })} label="Sensibilidad" />
          </div>
        )}
      </div>
      <div className="label">Doble página (tableta / horizontal)</div>
      <Segmented
        value={s.dualPage}
        onChange={(v) => onChange({ dualPage: v })}
        options={[
          { value: "auto", label: "Automática" },
          { value: "on", label: "Siempre" },
          { value: "off", label: "Nunca" },
        ]}
      />

      <div className="label">Gestos en los bordes</div>
      <div className="list">
        <Toggle title="Borde izquierdo: brillo" sub="Desliza arriba o abajo" on={s.edgeBrightness} onChange={(v) => onChange({ edgeBrightness: v })} />
        <Toggle title="Borde derecho: tamaño de letra" sub="Desliza arriba o abajo" on={s.edgeFontSize} onChange={(v) => onChange({ edgeFontSize: v })} />
        <div className="list-item col">
          <div className="li-title">Ignorar toques en los bordes · {s.edgeGuard ? `${s.edgeGuard} px` : "no"}</div>
          <div className="li-sub">Para pantallas curvas o sin marco</div>
          <Range value={s.edgeGuard} min={0} max={40} step={2} onChange={(v) => onChange({ edgeGuard: v })} label="Borde inactivo" />
        </div>
        <div className="list-item col">
          <div className="li-title">Velocidad del desplazamiento automático · {s.autoScrollSpeed}</div>
          <Range value={s.autoScrollSpeed} min={5} max={120} onChange={(v) => onChange({ autoScrollSpeed: v })} label="Velocidad" />
        </div>
      </div>

      <div className="label">Barra de herramientas</div>
      <Segmented
        value={String(s.toolbarRows) as "1" | "2"}
        onChange={(v) => onChange({ toolbarRows: v === "2" ? 2 : 1 })}
        options={[
          { value: "1", label: "Una línea" },
          { value: "2", label: "Dos líneas" },
        ]}
      />
      <div className="chips" style={{ marginTop: 10 }}>
        {ALL_TOOLS.map((t) => {
          const on = s.toolbarItems.includes(t);
          return (
            <button
              key={t}
              className={`chip ${on ? "active" : ""}`}
              onClick={() => onChange({ toolbarItems: on ? s.toolbarItems.filter((x) => x !== t) : [...s.toolbarItems, t] })}
            >
              {TOOL_LABEL[t]}
            </button>
          );
        })}
      </div>
    </>
  );
}

function FocusTab({ s, onChange }: TabProps) {
  const [time, setTime] = useState("22:00");
  return (
    <>
      <div className="list">
        <Toggle title="Filtro de luz azul" on={s.blueFilter} onChange={(v) => onChange({ blueFilter: v })} />
        {s.blueFilter && (
          <>
            <div className="list-item col">
              <div className="li-title">Intensidad · {Math.round(s.blueOpacity * 100)}%</div>
              <Range value={s.blueOpacity} min={0.05} max={0.8} step={0.01} onChange={(v) => onChange({ blueOpacity: v })} label="Opacidad del filtro" />
            </div>
            <div className="list-item col">
              <div className="li-title">Temperatura de color · {s.blueTemp} K</div>
              <Range value={s.blueTemp} min={1000} max={6500} step={100} onChange={(v) => onChange({ blueTemp: v })} label="Temperatura" />
            </div>
          </>
        )}
        <Toggle title="Regla de lectura" sub="Franja para seguir la línea; arrástrala desde la pestaña derecha" on={s.ruler} onChange={(v) => onChange({ ruler: v })} />
        {s.ruler && (
          <div className="list-item col">
            <div className="li-title">Alto de la regla · {s.rulerHeight.toFixed(1)} líneas</div>
            <Range value={s.rulerHeight} min={1} max={5} step={0.1} onChange={(v) => onChange({ rulerHeight: v })} label="Alto" />
          </div>
        )}
        <Toggle title="Resaltar la primera palabra de cada oración" on={s.sentenceStart} onChange={(v) => onChange({ sentenceStart: v })} />
        <Toggle title="Lectura biónica" sub="Resalta las letras iniciales de cada palabra" on={s.bionic} onChange={(v) => onChange({ bionic: v })} />
        {s.bionic && (
          <div className="list-item col">
            <div className="li-title">Parte resaltada · {Math.round(s.bionicRatio * 100)}%</div>
            <Range value={s.bionicRatio} min={0.2} max={0.7} step={0.05} onChange={(v) => onChange({ bionicRatio: v })} label="Proporción" />
          </div>
        )}
      </div>

      <div className="label">Descansos y alertas</div>
      <div className="list">
        <div className="list-item col">
          <div className="li-title">Recordatorio de descanso · {s.breakReminderMin ? `cada ${s.breakReminderMin} min` : "apagado"}</div>
          <Range value={s.breakReminderMin} min={0} max={120} step={5} onChange={(v) => onChange({ breakReminderMin: v })} label="Minutos de lectura continua" />
        </div>
        <div className="list-item col">
          <div className="li-title">Alertas a horas fijas</div>
          <div className="chips">
            {s.scheduledAlerts.map((t) => (
              <button key={t} className="chip active" onClick={() => onChange({ scheduledAlerts: s.scheduledAlerts.filter((x) => x !== t) })}>
                {t} ✕
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input className="field" type="time" style={{ flex: 1 }} value={time} onChange={(e) => setTime(e.target.value)} />
            <button
              className="btn btn-sm"
              onClick={() => {
                if (!time || s.scheduledAlerts.includes(time)) return;
                onChange({ scheduledAlerts: [...s.scheduledAlerts, time].sort() });
                if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
              }}
            >
              Agregar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function EngineTab({ s, onChange }: TabProps) {
  return (
    <>
      <div className="list">
        <Toggle
          title="Usar los estilos CSS del libro"
          sub="Sangrías, márgenes y alineaciones propias del libro (nunca colores ni fondos)"
          on={s.bookStyles}
          onChange={(v) => onChange({ bookStyles: v })}
        />
        <Toggle
          title="Respetar las fuentes del libro"
          sub={s.bookStyles ? "Si no, se aplica la tipografía elegida en Texto" : "Requiere activar los estilos del libro"}
          on={s.publisherFonts}
          onChange={(v) => onChange({ publisherFonts: v, ...(v ? { bookStyles: true } : {}) })}
        />
      </div>
      <div className="label">Notas al pie</div>
      <Segmented
        value={s.footnotes}
        onChange={(v) => onChange({ footnotes: v })}
        options={[
          { value: "popup", label: "Ventana" },
          { value: "inline", label: "En el texto" },
          { value: "jump", label: "Ir a la nota" },
        ]}
      />
      <p className="faint fmt-note">
        «En el texto» muestra cada nota junto a su llamada, dentro del capítulo. Los cambios del motor vuelven a abrir el libro.
      </p>
    </>
  );
}
