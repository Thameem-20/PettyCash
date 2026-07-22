"use client";

import { useRef, useState } from "react";

/** Instant hover list (avoids slow native title tooltips). */
export default function QuickHoverTip({
  preview,
  lines,
}: {
  preview: string;
  lines: string[];
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function show() {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
  }

  function hide() {
    setPos(null);
  }

  return (
    <>
      <span
        ref={anchorRef}
        className="block max-w-full cursor-default truncate underline decoration-dotted decoration-slate-300 underline-offset-2"
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {preview}
      </span>
      {pos && (
        <span
          role="tooltip"
          className="fixed z-[80] min-w-[10rem] max-w-[20rem] rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left text-xs font-normal leading-snug text-slate-700 shadow-lg"
          style={{ top: pos.top, left: pos.left }}
        >
          <span className="flex flex-col gap-1">
            {lines.map((p, i) => (
              <span key={`${i}-${p.slice(0, 24)}`} className="block break-words">
                {p}
              </span>
            ))}
          </span>
        </span>
      )}
    </>
  );
}
