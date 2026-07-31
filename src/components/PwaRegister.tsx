"use client";

import { useEffect } from "react";

/** Register service worker so PWA + Web Push stay active across navigations. */
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Pick up updated push handlers after deploys.
        void reg.update();
      })
      .catch(() => {
        // Non-fatal — manifest still applies standalone for most navigations.
      });
  }, []);
  return null;
}
