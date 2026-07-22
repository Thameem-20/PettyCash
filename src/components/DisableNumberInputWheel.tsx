"use client";

import { useEffect } from "react";

/**
 * Prevent mouse-wheel / trackpad scroll from changing focused number inputs
 * (common issue on amount fields).
 */
export default function DisableNumberInputWheel() {
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      if (el.type !== "number") return;
      if (document.activeElement !== el) return;
      e.preventDefault();
    }
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  return null;
}
