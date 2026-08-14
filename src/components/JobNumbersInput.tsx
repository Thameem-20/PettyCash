"use client";

import { useEffect, useRef, useState } from "react";

type JobResolveResult = {
  resolved: boolean;
  branch?: { id: number; name: string };
  handlers?: { id: number; name: string }[];
  error?: string;
};

export type JobNumbersStatus = {
  valid: boolean;
  branch?: { id: number; name: string };
  handlers?: { id: number; name: string }[];
  error?: string;
};

function statusEqual(a: JobNumbersStatus, b: JobNumbersStatus) {
  return (
    a.valid === b.valid &&
    a.error === b.error &&
    a.branch?.id === b.branch?.id &&
    (a.handlers?.map((h) => h.id).join(",") || "") === (b.handlers?.map((h) => h.id).join(",") || "")
  );
}

export default function JobNumbersInput({
  values,
  onChange,
  onStatusChange,
  allowMultiple = true,
  compact = false,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  onStatusChange?: (status: JobNumbersStatus) => void;
  /** When false, only one job number field (no "+ Add job number"). */
  allowMultiple?: boolean;
  compact?: boolean;
}) {
  const [resolved, setResolved] = useState<Record<number, JobResolveResult | null>>({});
  const rows = allowMultiple ? values : [values[0] ?? ""];
  const valuesKey = rows.join("\0");
  const onStatusRef = useRef(onStatusChange);
  onStatusRef.current = onStatusChange;
  const lastStatusRef = useRef<JobNumbersStatus | null>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const current = valuesKey.split("\0");

    current.forEach((value, index) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setResolved((prev) => ({ ...prev, [index]: null }));
        return;
      }

      const timer = setTimeout(async () => {
        const res = await fetch(`/api/routing/resolve?job_number=${encodeURIComponent(trimmed)}`);
        const d = await res.json();
        setResolved((prev) => ({ ...prev, [index]: d.ok ? d : { resolved: false, error: d.error } }));
      }, 400);
      timers.push(timer);
    });

    return () => timers.forEach(clearTimeout);
  }, [valuesKey]);

  useEffect(() => {
    const current = valuesKey.split("\0");
    const filled = current
      .map((v, i) => ({ value: v.trim(), r: resolved[i] }))
      .filter((x) => x.value);

    let next: JobNumbersStatus;

    if (filled.length === 0) {
      next = { valid: false, error: "Job number is required" };
    } else {
      const branchIds = new Set<number>();
      let firstBranch: JobResolveResult["branch"];
      let firstHandlers: JobResolveResult["handlers"];
      let failed: JobNumbersStatus | null = null;

      for (const { r } of filled) {
        if (!r?.resolved) {
          failed = { valid: false, error: r?.error || "Job number branch not identified" };
          break;
        }
        if (r.branch?.id) branchIds.add(r.branch.id);
        if (!firstBranch && r.branch) {
          firstBranch = r.branch;
          firstHandlers = r.handlers;
        }
      }

      if (failed) {
        next = failed;
      } else if (branchIds.size > 1) {
        next = { valid: false, error: "All job numbers must belong to the same branch" };
      } else {
        next = { valid: true, branch: firstBranch, handlers: firstHandlers };
      }
    }

    if (lastStatusRef.current && statusEqual(lastStatusRef.current, next)) return;
    lastStatusRef.current = next;
    onStatusRef.current?.(next);
  }, [valuesKey, resolved]);

  function update(index: number, next: string) {
    if (!allowMultiple) {
      onChange([next.toUpperCase()]);
      return;
    }
    onChange(values.map((v, i) => (i === index ? next.toUpperCase() : v)));
  }

  function addRow() {
    onChange([...values, ""]);
  }

  function removeRow(index: number) {
    if (values.length <= 1) {
      onChange([""]);
      return;
    }
    onChange(values.filter((_, i) => i !== index));
  }

  const filledCount = rows.filter((v) => v.trim()).length;
  const branchIds = new Set(
    rows
      .map((v, i) => (v.trim() && resolved[i]?.resolved ? resolved[i]!.branch!.id : null))
      .filter((id): id is number => id != null)
  );
  const branchMismatch = branchIds.size > 1;
  const firstOk = rows.find((v, i) => v.trim() && resolved[i]?.resolved);
  const firstIdx = firstOk ? rows.indexOf(firstOk) : -1;
  const summary = firstIdx >= 0 ? resolved[firstIdx] : null;

  return (
    <div className={compact ? "space-y-1.5" : "space-y-3"}>
      <div className="flex items-center justify-between gap-2">
        <label className="label mb-0">{allowMultiple ? "Job Numbers" : "Job Number"}</label>
        {allowMultiple && (
          <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={addRow}>
            + Add job number
          </button>
        )}
      </div>

      {rows.map((value, index) => (
        <div key={index}>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="e.g. 133/SIMP/26/225 or 133/WHCS/CURM/26/31"
              value={value}
              onChange={(e) => update(index, e.target.value)}
            />
            {allowMultiple && values.length > 1 && (
              <button
                type="button"
                className="btn-secondary shrink-0 px-3"
                onClick={() => removeRow(index)}
                aria-label="Remove job number"
              >
                ×
              </button>
            )}
          </div>
          {resolved[index]?.resolved && (
            <p className="mt-1 text-xs text-emerald-700">→ {resolved[index]?.branch?.name}</p>
          )}
          {resolved[index] && !resolved[index]?.resolved && value.trim() && (
            <p className="mt-1 text-xs text-rose-700">{resolved[index]?.error}</p>
          )}
        </div>
      ))}

      {summary?.resolved && !branchMismatch && filledCount > 0 && (
        <p
          className={`border border-emerald-300 bg-emerald-50 text-emerald-700 ${
            compact ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"
          }`}
        >
          Branch: <b>{summary.branch?.name}</b> · Accounts:{" "}
          {summary.handlers?.map((h) => h.name).join(", ") || "Unassigned"}
          {allowMultiple && filledCount > 1 && (
            <span className="mt-1 block text-xs">{filledCount} job numbers on this request</span>
          )}
        </p>
      )}
      {branchMismatch && (
        <p className="border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
          All job numbers must belong to the same branch.
        </p>
      )}
    </div>
  );
}
