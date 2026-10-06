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
    registerSW({ immediate: true });
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
    await runImport(files, { external: true });
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
    if (items.length) await runImport(items.map((i) => i.file), { external: true });
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
