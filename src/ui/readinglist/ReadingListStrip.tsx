// Tarjeta de la biblioteca con los próximos libros de la lista por leer.
import { ChevronRight, ListOrdered, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { navigate } from "../../lib/router";
import { isActiveItem } from "../../notes/readingList";
import { useStore } from "../../store/store";
import { openBook } from "../library/useOpenBook";
import { AddSheet, ItemCover } from "./ReadingListScreen";

export function ReadingListStrip() {
  const list = useStore((s) => s.readingList);
  const active = useMemo(() => list.filter(isActiveItem), [list]);
  const [adding, setAdding] = useState(false);

  if (!active.length) {
    return (
      <>
        <button className="rl-invite" onClick={() => setAdding(true)}>
          <span className="rl-invite-icon">
            <ListOrdered size={20} />
          </span>
          <span className="rl-invite-text">
            <b>Arma tu lista por leer</b>
            <span>Elige qué viene después y ordénalo a tu gusto</span>
          </span>
          <ChevronRight size={18} className="faint" />
        </button>
        <AddSheet open={adding} onClose={() => setAdding(false)} />
      </>
    );
  }

  return (
    <section className="rl-strip">
      <button className="section-title rl-strip-head" onClick={() => navigate({ name: "readingList" })}>
        <span>
          Lista por leer · {active.length}
        </span>
        <span className="rl-strip-all">
          Ordenar <ChevronRight size={16} />
        </span>
      </button>
      <div className="rl-strip-row">
        {active.slice(0, 10).map((item, i) => (
          <button
            key={item.id}
            className="rl-strip-item"
            onClick={() => (item.bookId ? openBook(item.bookId) : navigate({ name: "readingList" }))}
            aria-label={`${i + 1}. ${item.title}`}
          >
            <span className="rl-strip-cover">
              <ItemCover item={item} />
              <span className="rl-strip-num">{i + 1}</span>
              {!item.bookId && <span className="rl-strip-wish">deseo</span>}
            </span>
            <span className="rl-strip-title">{item.title}</span>
          </button>
        ))}
        <button className="rl-strip-item add" onClick={() => setAdding(true)} aria-label="Añadir a la lista">
          <span className="rl-strip-cover">
            <Plus size={24} />
          </span>
          <span className="rl-strip-title">Añadir</span>
        </button>
      </div>
      <AddSheet open={adding} onClose={() => setAdding(false)} />
    </section>
  );
}
