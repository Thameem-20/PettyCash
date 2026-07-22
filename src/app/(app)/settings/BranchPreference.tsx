"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Branch = { id: number; branch_name: string; branch_code?: string };

export default function BranchPreference({
  branches,
  current,
  allowAll,
}: {
  branches: Branch[];
  current: number | "all";
  allowAll: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | "all">(current);

  async function save(next: number | "all") {
    setSelected(next);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/settings/branch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: next }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Could not save branch");
        setSelected(current);
        return;
      }
      router.refresh();
    } catch {
      setError("Could not save branch");
      setSelected(current);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      
      <div className="grid gap-2 sm:grid-cols-2">
        {branches.map((b) => {
          const active = selected === b.id;
          return (
            <button
              key={b.id}
              type="button"
              disabled={busy}
              onClick={() => save(b.id)}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                active
                  ? "border-brand-500 bg-brand-50 shadow-sm ring-1 ring-brand-400/40"
                  : "border-slate-200 bg-white hover:border-brand-300 hover:bg-slate-50"
              }`}
            >
              <p className={`text-sm font-semibold ${active ? "text-brand-800" : "text-slate-800"}`}>
                {b.branch_name}
              </p>
              {b.branch_code && (
                <p className="mt-0.5 text-xs text-slate-500">{b.branch_code}</p>
              )}
              {active && (
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
                  Active
                </p>
              )}
            </button>
          );
        })}
        {allowAll && (
          <button
            type="button"
            disabled={busy}
            onClick={() => save("all")}
            className={`rounded-xl border px-4 py-3 text-left transition sm:col-span-2 ${
              selected === "all"
                ? "border-brand-500 bg-brand-50 shadow-sm ring-1 ring-brand-400/40"
                : "border-slate-200 bg-white hover:border-brand-300 hover:bg-slate-50"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                selected === "all" ? "text-brand-800" : "text-slate-800"
              }`}
            >
              All Branches
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Combined view across every branch you can access
            </p>
            {selected === "all" && (
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
                Active
              </p>
            )}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
