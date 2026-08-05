"use client";

import { useEffect } from "react";

/**
 * Full-screen blocker while a request is uploading/processing.
 * Prevents accidental taps on nav and warns before closing the tab.
 */
export default function SubmitBlockingOverlay({
  open,
  progress,
  title = "Submitting request…",
  detail,
}: {
  open: boolean;
  /** 0–100 while uploading; null = indeterminate (server processing). */
  progress: number | null;
  title?: string;
  detail?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const pct = progress == null ? null : Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/55 px-4 backdrop-blur-[1px]"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="submit-overlay-title"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-sm border border-slate-200 bg-white p-5 shadow-xl">
        <p id="submit-overlay-title" className="text-base font-semibold text-slate-900">
          {title}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {detail ||
            (pct == null
              ? "Saving on the server — please wait."
              : "Uploading receipts — please stay on this screen.")}
        </p>
        <div className="mt-4 h-2.5 w-full overflow-hidden bg-slate-100">
          {pct == null ? (
            <div className="h-full w-full animate-pulse bg-brand-600/80" />
          ) : (
            <div
              className="h-full bg-brand-600 transition-[width] duration-150 ease-out"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <p className="mt-2 text-center text-xs font-medium tabular-nums text-slate-500">
          {pct == null ? "Processing…" : `${pct}%`}
        </p>
        <p className="mt-3 text-center text-xs text-amber-800">
          Do not go back or open another screen until this finishes.
        </p>
      </div>
    </div>
  );
}

/** POST FormData with upload progress (XHR). Resolves parsed JSON body. */
export function postFormDataWithProgress<T = { ok: boolean; error?: string; id?: number }>(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      onProgress(Math.min(99, (e.loaded / e.total) * 100));
    };
    xhr.upload.onload = () => onProgress(100);
    xhr.onload = () => {
      const body = xhr.response;
      if (body && typeof body === "object") {
        resolve(body as T);
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as T);
      } catch {
        reject(new Error(xhr.statusText || "Invalid response"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(formData);
  });
}
