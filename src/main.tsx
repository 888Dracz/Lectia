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
    return consumeSharedFiles();
  });
