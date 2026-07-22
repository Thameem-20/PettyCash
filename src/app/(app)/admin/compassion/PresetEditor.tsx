"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type PresetKind = "truck" | "trailer" | "description";
export type Preset = { id: number; kind: PresetKind; value: string; is_active: number };

export default function PresetEditor({
  kind,
  title,
  placeholder,
  presets: initial,
}: {
  kind: PresetKind;
  title: string;
  placeholder: string;
  presets: Preset[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  async function save(payload: { id?: number; value: string; is_active?: boolean }) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/compassion-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, kind }),
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error || "Save failed");
        return;
      }

      if (payload.id) {
        setRows((prev) =>
          prev.map((x) =>
            x.id === payload.id
              ? { ...x, value: payload.value, is_active: payload.is_active ? 1 : 0 }
              : x
          )
        );
      } else if (d.id) {
        const next: Preset = {
          id: Number(d.id),
          kind,
          value: String(d.value),
          is_active: 1,
        };
        setRows((prev) =>
          [...prev, next].sort((a, b) =>
            a.value.localeCompare(b.value, undefined, { sensitivity: "base" })
          )
        );
        setValue("");
      }

      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold text-slate-800">Add {title.toLowerCase()}</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="input max-w-sm"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !value.trim()}
            onClick={() => save({ value: value.trim(), is_active: true })}
          >
            Add
          </button>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr>
              <th className="th">{title}</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td className="td text-slate-400" colSpan={3}>
                  No presets yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="td font-medium">{r.value}</td>
                  <td className="td">{r.is_active ? "Active" : "Inactive"}</td>
                  <td className="td text-right">
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      disabled={busy}
                      onClick={() => save({ id: r.id, value: r.value, is_active: !r.is_active })}
                    >
                      {r.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
