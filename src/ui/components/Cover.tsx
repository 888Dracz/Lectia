import { useEffect, useState } from "react";
import type { BookMeta } from "../../books/types";
import { getCover } from "../../lib/db";
import { hashString } from "../../lib/util";

const urlCache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

export function coverUrl(id: string): Promise<string | null> {
  if (urlCache.has(id)) return Promise.resolve(urlCache.get(id)!);
  if (!pending.has(id)) {
    pending.set(
      id,
      getCover(id)
        .then((blob) => {
          const url = blob ? URL.createObjectURL(blob) : null;
          urlCache.set(id, url);
          return url;
        })
        .finally(() => pending.delete(id))
    );
  }
  return pending.get(id)!;
}

export function invalidateCover(id: string) {
  const url = urlCache.get(id);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(id);
}

export function useCoverUrl(book: Pick<BookMeta, "id" | "hasCover" | "coverRev">): string | null {
  const [url, setUrl] = useState<string | null>(() => (book.hasCover ? urlCache.get(book.id) ?? null : null));
  useEffect(() => {
    let alive = true;
    if (!book.hasCover) {
      setUrl(null);
      return;
    }
    void coverUrl(book.id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [book.id, book.hasCover, book.coverRev]);
  return url;
}

const PALETTES: [string, string, string][] = [
  ["#2b2d6e", "#6b4fbb", "#fff"],
  ["#0f4c5c", "#2a9d8f", "#fff"],
  ["#7a2e3a", "#c8553d", "#fff4e6"],
  ["#1d3557", "#457b9d", "#f1faee"],
  ["#3d2c2e", "#a26769", "#fff"],
  ["#264027", "#6a994e", "#f2e8cf"],
  ["#5e3a87", "#c06c84", "#fff"],
  ["#1b1b1b", "#4a4a4a", "#f2b544"],
  ["#8d5524", "#c68642", "#fffaf0"],
  ["#003049", "#d62828", "#fdf0d5"],
  ["#233d4d", "#fe7f2d", "#fff"],
  ["#40263a", "#e07a5f", "#f4f1de"],
];

const ORNAMENTS = ["✦", "❦", "✧", "❧", "☾", "✺", "❈", "✶"];

export function GeneratedCover({ title, author }: { title: string; author: string }) {
  const h = hashString(title + author);
  const [a, b, ink] = PALETTES[h % PALETTES.length];
  const angle = 140 + (h % 80);
  const len = title.length;
  const size = len < 14 ? 15 : len < 28 ? 12.5 : len < 50 ? 10.5 : 9;
  return (
    <div
      className="gen-cover"
      style={{
        ["--gc-bg" as string]: `radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.18), transparent 60%), linear-gradient(${angle}deg, ${a}, ${b})`,
        ["--gc-ink" as string]: ink,
        ["--gc-size" as string]: `${size}cqw`,
      }}
    >
      <div className="gc-orn">{ORNAMENTS[(h >> 4) % ORNAMENTS.length]}</div>
      <div className="gc-title">{title}</div>
      {author && <div className="gc-author">{author}</div>}
    </div>
  );
}

export function Cover({ book, className }: { book: BookMeta; className?: string }) {
  const url = useCoverUrl(book);
  return (
    <div className={`cover ${className ?? ""}`}>
      {url ? <img src={url} alt="" draggable={false} /> : <GeneratedCover title={book.title} author={book.author} />}
    </div>
  );
}
