"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Driver = { id: number; name: string; is_active: number };

export default function DriverEditor({ drivers: initial }: { drivers: Driver[] }) {
  const router = useRouter();
  const [drivers, setDrivers] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDrivers(initial);
  }, [initial]);

  async function save(payload: { id?: number; name: string; is_active?: boolean }) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error || "Save failed");
        return;
      }

      if (payload.id) {
        setDrivers((prev) =>
          prev.map((x) =>
            x.id === payload.id
              ? { ...x, name: payload.name, is_active: payload.is_active ? 1 : 0 }
              : x
          )
        );
      } else if (d.id) {
        const next: Driver = { id: Number(d.id), name: String(d.name), is_active: 1 };
        setDrivers((prev) =>
          [...prev, next].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
        );
        setName("");
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
        <h2 className="text-sm font-semibold text-slate-800">Add driver</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="input max-w-xs"
            placeholder="Driver name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !name.trim()}
            onClick={() => save({ name: name.trim(), is_active: true })}
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
              <th className="th">Name</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {drivers.length === 0 ? (
              <tr>
                <td className="td text-slate-400" colSpan={3}>
                  No drivers yet.
                </td>
              </tr>
            ) : (
              drivers.map((d) => (
                <tr key={d.id}>
                  <td className="td font-medium">{d.name}</td>
                  <td className="td">{d.is_active ? "Active" : "Inactive"}</td>
                  <td className="td text-right">
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      disabled={busy}
                      onClick={() => save({ id: d.id, name: d.name, is_active: !d.is_active })}
                    >
                      {d.is_active ? "Deactivate" : "Activate"}
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
