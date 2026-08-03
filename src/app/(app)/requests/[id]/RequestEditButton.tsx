"use client";

import { useEffect, useState } from "react";

/** Dispatches a custom event so RequestDetailsEditor can enter edit mode. */
export function requestStartEdit() {
  window.dispatchEvent(new CustomEvent("pc-request-start-edit"));
}

export function useRequestEditTrigger(onStart: () => void) {
  useEffect(() => {
    function handler() {
      onStart();
    }
    window.addEventListener("pc-request-start-edit", handler);
    return () => window.removeEventListener("pc-request-start-edit", handler);
  }, [onStart]);
}

export default function RequestEditButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <button
      type="button"
      className="btn-secondary px-3 py-1.5 text-sm"
      onClick={() => requestStartEdit()}
    >
      Edit
    </button>
  );
}
