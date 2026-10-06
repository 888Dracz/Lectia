import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBackClose } from "../../lib/router";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Altura fija (p. ej. "70dvh") en lugar de ajustarse al contenido. */
  height?: string;
  className?: string;
  noBackdropBlur?: boolean;
}

/** Hoja inferior deslizable. Se cierra tocando fuera, arrastrando o con "atrás". */
export function Sheet({ open, onClose, title, actions, children, height, className, noBackdropBlur }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, 220);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  useBackClose(open, onClose);

  if (!mounted) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !panel.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    panel.current.style.transition = "none";
    panel.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onPointerUp = () => {
    if (!drag.current || !panel.current) return;
    const { dy } = drag.current;
    drag.current = null;
    panel.current.style.transition = "";
    panel.current.style.transform = "";
    if (dy > 90) onClose();
  };

  return createPortal(
    <>
      <div
        className={`backdrop ${closing ? "closing" : ""}`}
        style={noBackdropBlur ? { backdropFilter: "none", WebkitBackdropFilter: "none" } : undefined}
        onClick={onClose}
      />
      <div
        ref={panel}
        className={`sheet ${closing ? "closing" : ""} ${className ?? ""}`}
        style={height ? { height } : undefined}
        role="dialog"
        aria-modal="true"
      >
        <div className="sheet-handle" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
        {(title || actions) && (
          <div className="sheet-head" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <div className="sheet-title">{title}</div>
            {actions}
            <button className="icon-btn" onClick={onClose} aria-label="Cerrar" onPointerDown={(e) => e.stopPropagation()}>
              <X size={22} />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </>,
    document.body
  );
}
