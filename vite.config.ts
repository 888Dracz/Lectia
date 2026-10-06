/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

const BOOK_TYPES = {
  "application/pdf": [".pdf"],
  "application/epub+zip": [".epub"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "text/html": [".html", ".htm"],
  "application/x-fictionbook+xml": [".fb2"],
  "application/vnd.comicbook+zip": [".cbz"],
};

// En producción se publica en GitHub Pages bajo /<repositorio>/ (p. ej. /lectia/).
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "lectia";
export default defineConfig(({ command, isPreview }) => {
  const base = command === "build" || isPreview ? `/${repoName}/` : "/";
  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
      react(),
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: ["icon.svg", "apple-touch-icon.png"],
        manifest: {
          id: base,
          name: "Lectia · Lector",
          short_name: "Lectia",
          description: "Lee PDF, EPUB, Word y más en tu celular. Biblioteca, lectura rápida, minijuegos y respaldo.",
          lang: "es",
          dir: "ltr",
          start_url: base,
          scope: base,
          display: "standalone",
          orientation: "any",
          background_color: "#0d0f15",
          theme_color: "#0d0f15",
          categories: ["books", "education", "productivity"],
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
            { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
          ],
          share_target: {
            action: `${base}compartir`,
            method: "POST",
            enctype: "multipart/form-data",
            params: {
              files: [
                {
                  name: "libros",
                  accept: [...Object.keys(BOOK_TYPES), "application/octet-stream", "application/zip", "text/*", ...Object.values(BOOK_TYPES).flat()],
                },
              ],
            },
          },
          file_handlers: [{ action: base, accept: BOOK_TYPES }],
        },
        injectManifest: {
          // Solo se guardan sin conexión las fuentes latinas (las demás, al usarse).
          globPatterns: ["**/*.{js,mjs,css,html,svg,png}", "**/*-latin-*.woff2"],
          globIgnores: ["pdfjs/**"],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
        devOptions: { enabled: false },
      }),
    ],
    build: {
      target: "es2022",
      chunkSizeWarningLimit: 2500,
    },
    test: {
      globals: true,
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  };
});
