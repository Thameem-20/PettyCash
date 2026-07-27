"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetch server components while the tab is visible (low-load live queues). */
const INTERVAL_MS = 60_000;

export default function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };

    const id = setInterval(refreshIfVisible, INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}
