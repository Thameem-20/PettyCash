"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type FleetVehicleRow = {
  id: number;
  plate_no: string;
  label: string;
  is_active: number;
};

export default function VehicleEditor({ vehicles: initial }: { vehicles: FleetVehicleRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [editId, setEditId] = useState<number | null>(null);
  const [plateNo, setPlateNo] = useState("");
  const [label, setLabel] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  function resetForm() {
    setEditId(null);
    setPlateNo("");
    setLabel("");
    setIsActive(true);
    setError("");
  }

  function startEdit(r: FleetVehicleRow) {
    setEditId(r.id);
    setPlateNo(r.plate_no);
    setLabel(r.label);
    setIsActive(!!r.is_active);
    setError("");
  }

  async function save(payload: {
    id?: number;
    plate_no: string;
    label: string;
    is_active?: boolean;
  }) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/vehicles", {
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
        setRows((prev) =>
          [...prev]
            .map((x) =>
              x.id === payload.id
                ? {
                    ...x,
                    plate_no: payload.plate_no,
                    label: payload.label,
                    is_active: payload.is_active ? 1 : 0,
                  }
                : x
            )
            .sort((a, b) =>
              a.plate_no.localeCompare(b.plate_no, undefined, { sensitivity: "base" })
            )
        );
        resetForm();
      } else if (d.id) {
        const next: FleetVehicleRow = {
          id: Number(d.id),
          plate_no: String(d.plate_no),
          label: String(d.label),
          is_active: 1,
        };
        setRows((prev) =>
          [...prev, next].sort((a, b) =>
            a.plate_no.localeCompare(b.plate_no, undefined, { sensitivity: "base" })
          )
        );
        resetForm();
      }

      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  const isEdit = editId != null;

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold text-slate-800">
          {isEdit ? "Edit vehicle" : "Add vehicle"}
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="input max-w-[10rem]"
            placeholder="e.g. DXB 15212"
            value={plateNo}
            onChange={(e) => setPlateNo(e.target.value)}
          />
          <input
            className="input max-w-xs"
            placeholder="e.g. Nissan Sunny"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active
            </label>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !plateNo.trim() || !label.trim()}
            onClick={() =>
              save(
                isEdit
                  ? {
                      id: editId,
                      plate_no: plateNo.trim(),
                      label: label.trim(),
                      is_active: isActive,
                    }
                  : {
                      plate_no: plateNo.trim(),
                      label: label.trim(),
                      is_active: true,
                    }
              )
            }
          >
            {isEdit ? "Update" : "Add"}
          </button>
          {isEdit && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr>
              <th className="th">Plate no</th>
              <th className="th">Vehicle</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td className="td text-slate-400" colSpan={4}>
                  No vehicles yet. Add plate numbers and names for fuel charges.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className={editId === r.id ? "bg-muted/40" : undefined}>
                  <td className="td font-medium">{r.plate_no}</td>
                  <td className="td">{r.label}</td>
                  <td className="td">{r.is_active ? "Active" : "Inactive"}</td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="text-sm text-brand-600 hover:underline"
                        disabled={busy}
                        onClick={() => startEdit(r)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        disabled={busy}
                        onClick={() =>
                          save({
                            id: r.id,
                            plate_no: r.plate_no,
                            label: r.label,
                            is_active: !r.is_active,
                          })
                        }
                      >
                        {r.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
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
