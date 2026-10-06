import { Minus, Plus, Sun } from "lucide-react";
import type { BookMeta } from "../../books/types";
import type { ReaderSettings } from "../../store/state";
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

export function FormatSheet({ open, onClose, settings: s, onChange, book, onPdfMode, fixedLayout }: Props) {
  const isPdfPages = book.format === "pdf" && (book.pdfMode ?? "pages") === "pages";
  const textOptions = !isPdfPages && !fixedLayout;
  return (
    <Sheet open={open} onClose={onClose} title="Aspecto" noBackdropBlur>
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
      </div>

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
            value={s.mode}
            onChange={(v) => onChange({ mode: v })}
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
            <div className="list-item">
              <span className="li-main li-title">Sangría en párrafos</span>
              <Switch on={s.indent} onChange={(v) => onChange({ indent: v })} />
            </div>
            <div className="list-item">
              <span className="li-main li-title">Separar sílabas al final de línea</span>
              <Switch on={s.hyphenate} onChange={(v) => onChange({ hyphenate: v })} />
            </div>
          </>
        )}
        <div className="list-item">
          <span className="li-main">
            <div className="li-title">Animación al pasar página</div>
          </span>
          <Switch on={s.animation === "slide"} onChange={(v) => onChange({ animation: v ? "slide" : "none" })} />
        </div>
        <div className="list-item">
          <span className="li-main">
            <div className="li-title">Tocar los bordes para pasar página</div>
            <div className="li-sub">Izquierda: atrás · Derecha: adelante</div>
          </span>
          <Switch on={s.tapZones} onChange={(v) => onChange({ tapZones: v })} />
        </div>
        <div className="list-item">
          <span className="li-main li-title">Barra de estado (hora, batería, %)</span>
          <Switch on={s.showStatus} onChange={(v) => onChange({ showStatus: v })} />
        </div>
        <div className="list-item">
          <span className="li-main li-title">Mantener la pantalla encendida</span>
          <Switch on={s.keepAwake} onChange={(v) => onChange({ keepAwake: v })} />
        </div>
      </div>
    </Sheet>
  );
}
