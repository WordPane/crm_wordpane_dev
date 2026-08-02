"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (installing) {
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                console.log("[PWA] Nova versão disponível. Recarregue para atualizar.");
              }
            });
          }
        });
      })
      .catch((error) => {
        console.error("[PWA] Falha ao registrar service worker:", error);
      });
  }, []);

  return null;
}
