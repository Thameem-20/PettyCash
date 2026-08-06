"use client";

import { useEffect, useRef, useState } from "react";

export default function DescriptionAutocomplete({
  value,
  onChange,
  placeholder = "What is this payment for?",
  exclude = [],
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Descriptions already used (e.g. other charges) — hidden from suggestions. */
  exclude?: string[];
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const excludeKey = exclude
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("\0");

  useEffect(() => {
    const q = value.trim();
    if (q.length < 1) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const blockedExtra = excludeKey ? excludeKey.split("\0") : [];
    const t = setTimeout(async () => {
      const res = await fetch(`/api/meta/descriptions?q=${encodeURIComponent(q)}`);
      const d = await res.json();
      if (d.ok && Array.isArray(d.suggestions)) {
        const blocked = new Set([q.toLowerCase(), ...blockedExtra]);
        // Hide the already-selected value and any descriptions used on other charges.
        const filtered = (d.suggestions as string[]).filter(
          (s) => !blocked.has(s.trim().toLowerCase())
        );
        setSuggestions(filtered);
        setOpen(filtered.length > 0);
        setActiveIdx(-1);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [value, excludeKey]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(s: string) {
    onChange(s);
    setOpen(false);
    setSuggestions([]);
  }

  function onKeyDown(e: React.KeyboardEvent) {
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
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <textarea
        className="input"
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-0.5 max-h-48 w-full overflow-y-auto border border-slate-400 bg-white shadow-md">
          {suggestions.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                className={`block w-full px-3 py-2 text-left text-sm ${
                  i === activeIdx ? "bg-brand-100 text-brand-800" : "text-slate-700 hover:bg-slate-100"
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
