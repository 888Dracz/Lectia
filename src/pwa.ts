// Instalación como app (PWA), actualizaciones y archivos recibidos desde
// otras apps ("Compartir → Lectia") o abiertos con la app instalada.
import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";
import { takeInbox } from "./lib/db";
import { runImport } from "./ui/library/importFlow";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setupPwa() {
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    // Busca versiones nuevas al volver a la app y cada hora; al encontrar una,
    // el service worker toma el control y la página se recarga sola.
    registerSW({
      immediate: true,
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        const check = () => {
          if (navigator.onLine) registration.update().catch(() => undefined);
        };
        setInterval(check, 60 * 60 * 1000);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
      },
    });
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });

  // Archivos abiertos con la app instalada (escritorio / ChromeOS).
  const lq = (window as unknown as { launchQueue?: { setConsumer: (cb: (p: { files: FileSystemFileHandle[] }) => void) => void } }).launchQueue;
  lq?.setConsumer(async (params) => {
    if (!params.files?.length) return;
    const files = await Promise.all(params.files.map((h) => h.getFile()));
    await runImport(files);
  });
}

/** Importa lo que llegó por "Compartir" mientras la app estaba cerrada. */
export async function consumeSharedFiles() {
  const url = new URL(window.location.href);
  if (url.searchParams.has("compartido")) {
    url.searchParams.delete("compartido");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  try {
    const items = await takeInbox();
    if (items.length) await runImport(items.map((i) => i.file));
  } catch {
    /* sin bandeja */
  }
}

export function useInstallAvailable(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => !!deferred
  );
}

export async function installPrompt() {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice.catch(() => undefined);
  deferred = null;
  emit();
}
