import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/fraunces/wght.css";
import "@fontsource-variable/literata/wght.css";
import "@fontsource-variable/literata/wght-italic.css";
import "@fontsource-variable/lora/wght.css";
import "@fontsource-variable/lora/wght-italic.css";
import "@fontsource/merriweather/latin-400.css";
import "@fontsource/merriweather/latin-400-italic.css";
import "@fontsource/merriweather/latin-700.css";
import "@fontsource/merriweather/latin-ext-400.css";
import "@fontsource/merriweather/latin-ext-700.css";
import "@fontsource/atkinson-hyperlegible/latin-400.css";
import "@fontsource/atkinson-hyperlegible/latin-400-italic.css";
import "@fontsource/atkinson-hyperlegible/latin-700.css";
import "@fontsource/atkinson-hyperlegible/latin-ext-400.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/library.css";
import "./styles/reader.css";
import "./styles/games.css";
import "./styles/progress.css";
import { App } from "./App";
import { consumeSharedFiles, setupPwa } from "./pwa";
import { useStore } from "./store/store";
import { runSync } from "./sync/sync";

// Aplica el tema antes de pintar para evitar parpadeos.
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.dataset.theme = prefersDark ? "dark" : "light";

createRoot(document.getElementById("root")!).render(<App />);

setupPwa();
void useStore
  .getState()
  .hydrate()
  .then(() => {
    useStore.getState().checkAchievements();
    autoSync("both");
    return consumeSharedFiles();
  });

// Sincronización automática: al abrir la app y al salir de ella.
function autoSync(direction: "both" | "upload") {
  const sync = useStore.getState().app.sync;
  if (!sync.auto || sync.provider === "none" || !navigator.onLine) return;
  void runSync(direction).catch((e) => console.warn("Sincronización", e));
}
let lastAutoUpload = 0;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && Date.now() - lastAutoUpload > 60000) {
    lastAutoUpload = Date.now();
    autoSync("upload");
  }
});
