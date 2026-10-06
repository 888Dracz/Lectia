import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { htmlToFlatText } from "../../books/html";
import type { BookContent } from "../../books/types";
import { searchText } from "../../lib/text";
import { Sheet } from "../components/Sheet";

export interface SearchResult {
  chapter: number;
  index: number;
  length: number;
  snippet: string;
  matchStart: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  content: BookContent;
  /** En PDF con páginas originales no hay texto fluido. */
  pdfPages: boolean;
  onGo: (r: SearchResult) => void;
}

export function SearchSheet({ open, onClose, content, pdfPages, onGo }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [done, setDone] = useState(false);
  const token = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const my = ++token.current;
    setResults([]);
    setDone(false);
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      setSearching(true);
      const total = content.kind === "pdf" ? content.numPages : content.chapters.length;
      const found: SearchResult[] = [];
      for (let i = 0; i < total && found.length < 300; i++) {
        if (my !== token.current) return;
        let text = "";
        if (content.kind === "pdf") {
          text = pdfPages ? await content.getText(i) : htmlToFlatText(await content.asReflow().getHtml(i));
        } else text = htmlToFlatText(await content.getHtml(i));
        for (const h of searchText(text, q, 50)) {
          found.push({ chapter: i, index: h.index, length: h.length, snippet: h.snippet, matchStart: h.matchStart });
        }
        if (i % 8 === 7) {
          setResults([...found]);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      if (my === token.current) {
        setResults(found);
        setSearching(false);
        setDone(true);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, content, pdfPages]);

  const label = (c: number) => (content.kind === "pdf" ? `Página ${c + 1}` : content.chapters[c]?.title ?? `Capítulo ${c + 1}`);

  return (
    <Sheet open={open} onClose={onClose} title="Buscar en el libro" height="82dvh">
      <div className="lib-search" style={{ marginBottom: 12 }}>
        <Search size={18} className="faint" />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Palabra o frase" aria-label="Buscar en el libro" />
      </div>
      {searching && <p className="faint search-status">Buscando… {results.length} resultados</p>}
      {done && <p className="faint search-status">{results.length === 0 ? "Sin resultados" : `${results.length}${results.length >= 300 ? "+" : ""} resultados`}</p>}
      <div className="search-results">
        {results.map((r, i) => (
          <button key={i} className="search-hit" onClick={() => onGo(r)}>
            <div className="search-ch">{label(r.chapter)}</div>
            <div className="search-snip">
              {r.snippet.slice(0, r.matchStart)}
              <mark>{r.snippet.slice(r.matchStart, r.matchStart + r.length)}</mark>
              {r.snippet.slice(r.matchStart + r.length)}
            </div>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
