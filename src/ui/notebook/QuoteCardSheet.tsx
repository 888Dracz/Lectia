// Hoja para compartir un subrayado como tarjeta (imagen).
import { Download, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { deliverFile } from "../../backup/backup";
import { CARD_THEMES, drawQuoteCard, loadCardFonts, type CardFormat, type CardTheme } from "../../notes/quoteCard";
import { safeStorage } from "../../lib/util";
import type { Highlight } from "../../store/state";
import { toast } from "../../store/ui";
import { Segmented } from "../components/controls";
import { Sheet } from "../components/Sheet";

export interface CardSource {
  text: string;
  title: string;
  author: string;
  highlight?: Pick<Highlight, "style" | "color">;
}

export function QuoteCardSheet({ source, onClose }: { source: CardSource | null; onClose: () => void }) {
  // La hoja monta su contenido un instante después de abrirse: se dibuja cuando aparece el lienzo.
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [theme, setTheme] = useState<CardTheme>(() => (safeStorage.get("lectia-card-theme") as CardTheme) || "papel");
  const [format, setFormat] = useState<CardFormat>("square");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!source || !canvas) return;
    let alive = true;
    void loadCardFonts().then(() => {
      if (!alive) return;
      drawQuoteCard(canvas, {
        text: source.text,
        title: source.title,
        author: source.author,
        theme,
        format,
        style: source.highlight?.style,
        color: source.highlight?.color,
      });
    });
    return () => {
      alive = false;
    };
  }, [source, theme, format, canvas]);

  const deliver = async (share: boolean) => {
    const c = canvas;
    if (!c || !source) return;
    setBusy(true);
    try {
      const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("sin imagen"))), "image/png"));
      const name = `${source.title.replace(/[\\/:*?"<>|]+/g, "").slice(0, 40) || "cita"} - cita.png`;
      await deliverFile(new File([blob], name, { type: "image/png" }), share);
    } catch {
      toast("No se pudo crear la tarjeta", { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!source} onClose={onClose} title="Tarjeta de cita" height="88dvh">
      <div className={`card-preview ${format}`}>
        <canvas ref={setCanvas} />
      </div>
      <div className="card-themes" role="radiogroup" aria-label="Estilo">
        {CARD_THEMES.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={theme === t.id}
            className={`card-theme ${theme === t.id ? "active" : ""}`}
            onClick={() => {
              setTheme(t.id);
              safeStorage.set("lectia-card-theme", t.id);
            }}
          >
            <span className="card-swatch" style={{ background: t.swatch }} />
            {t.label}
          </button>
        ))}
      </div>
      <Segmented
        value={format}
        onChange={setFormat}
        options={[
          { value: "square", label: "Cuadrada" },
          { value: "story", label: "Historia" },
        ]}
      />
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn btn-outline" style={{ flex: 1 }} disabled={busy} onClick={() => void deliver(false)}>
          <Download size={18} /> Guardar
        </button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => void deliver(true)}>
          <Share2 size={18} /> Compartir
        </button>
      </div>
    </Sheet>
  );
}
