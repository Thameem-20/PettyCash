"use client";

import { useEffect, useRef, useState } from "react";

/** Text input with delayed suggestions (`endpoint` + `?q=`). */
export default function SuggestInput({
  value,
  onChange,
  placeholder,
  endpoint,
  className = "input",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Base URL without query, e.g. /api/meta/compassion-suggest?field=truck */
  endpoint: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = value.trim();
    // Only suggest while typing — never dump the full list on empty focus.
    if (q.length < 1) {
      setSuggestions([]);
      setOpen(false);
      setActiveIdx(-1);
      return;
    }

    const t = setTimeout(async () => {
      try {
        const sep = endpoint.includes("?") ? "&" : "?";
        const res = await fetch(`${endpoint}${sep}q=${encodeURIComponent(q)}`);
        const d = await res.json();
        if (d.ok && Array.isArray(d.suggestions)) {
          // Hide exact full matches; keep similar / partial matches only.
          const matches = d.suggestions.filter(
            (s: string) => s.trim().toLowerCase() !== q.toLowerCase()
          );
          setSuggestions(matches);
          setOpen(matches.length > 0);
          setActiveIdx(-1);
        }
      } catch {
        /* ignore */
      }
    }, 150);
    return () => clearTimeout(t);
  }, [value, endpoint]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(s: string) {
    onChange(s);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (value.trim().length >= 1 && suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        autoComplete="off"
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => (i + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
          } else if (e.key === "Enter" && activeIdx >= 0) {
            e.preventDefault();
            pick(suggestions[activeIdx]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((s, i) => (
            <li key={`${s}-${i}`}>
              <button
                type="button"
                className={`block w-full truncate px-3 py-2 text-left text-sm ${
                  i === activeIdx ? "bg-brand-50 text-brand-800" : "text-slate-700 hover:bg-slate-50"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
