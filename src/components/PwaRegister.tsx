"use client";

import { useEffect } from "react";

/** Register service worker so iOS/Android keep standalone mode across navigations. */
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Non-fatal — manifest still applies standalone for most navigations.
    });
  }, []);
  return null;
}
