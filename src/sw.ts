/// <reference lib="webworker" />
// Service worker: guarda la app para usarla sin conexión y recibe los
// archivos que se comparten con Lectia desde otras apps del teléfono.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { clientsClaim } from "workbox-core";
import { addInbox } from "./lib/db";

declare let self: ServiceWorkerGlobalScope;

const BASE = import.meta.env.BASE_URL;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(new NavigationRoute(createHandlerBoundToURL(`${BASE}index.html`)));

registerRoute(
  ({ url }) => url.pathname.startsWith(`${BASE}pdfjs/`),
  new CacheFirst({ cacheName: "pdfjs-assets", plugins: [new ExpirationPlugin({ maxEntries: 400 })] })
);

registerRoute(
  ({ request }) => request.destination === "font",
  new CacheFirst({ cacheName: "fonts", plugins: [new ExpirationPlugin({ maxEntries: 120 })] })
);

// Web Share Target: "Compartir → Lectia" en Android.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== `${BASE}compartir`) return;
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const files = form.getAll("libros").filter((f): f is File => f instanceof File);
        for (const file of files) {
          await addInbox({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, receivedAt: Date.now() });
        }
        return Response.redirect(`${BASE}?compartido=${files.length}`, 303);
      } catch {
        return Response.redirect(BASE, 303);
      }
    })()
  );
});
