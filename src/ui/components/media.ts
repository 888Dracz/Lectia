// Imágenes de los cuadernos (recortes y trazos) guardadas en IndexedDB.
import { useEffect, useState } from "react";
import { getMedia } from "../../lib/db";

const urls = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();
const revisions = new Map<string, number>();
const listeners = new Set<() => void>();

export function mediaUrl(id: string): Promise<string | null> {
  if (urls.has(id)) return Promise.resolve(urls.get(id)!);
  if (!pending.has(id)) {
    pending.set(
      id,
      getMedia(id)
        .then((blob) => {
          const url = blob ? URL.createObjectURL(blob) : null;
          urls.set(id, url);
          return url;
        })
        .catch(() => null)
        .finally(() => pending.delete(id))
    );
  }
  return pending.get(id)!;
}

/** La imagen cambió (p. ej. se redibujó la vista previa de un trazo). */
export function invalidateMedia(id: string) {
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
  revisions.set(id, (revisions.get(id) ?? 0) + 1);
  listeners.forEach((f) => f());
}

export function useMediaUrl(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? urls.get(id) ?? null : null));
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const f = () => setRev((r) => r + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    if (!id) {
      setUrl(null);
      return;
    }
    void mediaUrl(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id, rev]);
  return url;
}
