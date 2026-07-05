/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
// En producción la app se sirve como GitHub Pages de proyecto, bajo
// /campanita/. En desarrollo se sirve desde la raíz.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/campanita/" : "/",
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
}));
