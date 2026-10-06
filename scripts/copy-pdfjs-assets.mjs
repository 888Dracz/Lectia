// Copia los recursos que pdf.js carga en tiempo de ejecución (mapas de
// caracteres, fuentes estándar y decodificadores wasm) a public/pdfjs para
// que se sirvan junto a la app y queden disponibles sin conexión.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist");
const dest = join(root, "public", "pdfjs");

if (!existsSync(src)) {
  console.warn("pdfjs-dist no está instalado; ejecuta npm install");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  if (existsSync(join(src, dir))) {
    cpSync(join(src, dir), join(dest, dir), { recursive: true });
  }
}
console.log("Recursos de pdf.js copiados a public/pdfjs");
