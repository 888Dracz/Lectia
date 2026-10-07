// Miniaturas de portadas para compartir libros en Novedades (pocos KB).
import { getCover } from "../lib/db";

export async function coverThumb(bookId: string, width = 140): Promise<string | undefined> {
  try {
    const blob = await getCover(bookId);
    if (!blob) return undefined;
    const bmp = await createImageBitmap(blob);
    const h = Math.round((bmp.height * width) / bmp.width);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.min(h, width * 2);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, width, h);
    bmp.close();
    const url = canvas.toDataURL("image/jpeg", 0.72);
    return url.length < 45000 ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Solo se muestran imágenes incrustadas (nunca enlaces externos). */
export function safeImage(src: string | undefined): string | undefined {
  return src && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : undefined;
}
