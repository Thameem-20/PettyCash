"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { BranchProfile } from "@/lib/branchProfile";
import { CHARGE_TYPE_SCOPE_LABELS, type ChargeTypeScope } from "@/lib/chargeTypePolicy";

export default function ProfilesEditor({
  profiles,
  supervisors,
}: {
  profiles: BranchProfile[];
  supervisors: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(profiles);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState<number | null>(null);

  function patch(branchId: number, field: string, value: string | number | boolean | null) {
    setRows((prev) =>
      prev.map((r) => (r.branch_id === branchId ? { ...r, [field]: value } : r))
    );
  }

  async function save(row: BranchProfile) {
    setBusyId(row.branch_id);
    setError("");
    setSavedId(null);
    try {
      const res = await fetch("/api/admin/control-panel/profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: row.branch_id,
          request_mode: row.request_mode,
          coding_type: row.coding_type,
          default_supervisor_user_id: row.default_supervisor_user_id,
          allow_suspense: Boolean(row.allow_suspense),
          charge_type_scope: row.charge_type_scope,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Could not save");
        return;
      }
      setRows(data.profiles);
      setSavedId(row.branch_id);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusyId(null);
    }
  }

  const scopeOptions = Object.entries(CHARGE_TYPE_SCOPE_LABELS) as [ChargeTypeScope, string][];

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Configure request fields, accounts coding, charge types, and default supervisor per branch.
        Compassion-mode branches can manage drivers/presets under{" "}
        <Link href="/admin/compassion" className="text-brand-700 hover:underline">
          Compassion
        </Link>
        . Use <b>Charge types</b> to lock a branch to job-only or non-job-only (e.g. CLI).
      </p>
      {error && <p className="text-sm text-rose-700">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Branch</th>
              <th className="th">Request mode</th>
              <th className="th">Coding</th>
              <th className="th">Default supervisor</th>
              <th className="th">Suspense</th>
              <th className="th">Charge types</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.branch_id}>
                <td className="td">
                  <span className="font-medium">{r.branch_name}</span>
                  <span className="ml-1 text-xs text-slate-400">{r.branch_code}</span>
                </td>
                <td className="td">
                  <select
                    className="input py-1 text-sm"
                    value={r.request_mode}
                    onChange={(e) => patch(r.branch_id, "request_mode", e.target.value)}
                  >
                    <option value="job_based">Default</option>
                    <option value="compassion">Compassion</option>
                  </select>
                </td>
                <td className="td">
                  <select
                    className="input py-1 text-sm"
                    value={r.coding_type}
                    onChange={(e) => patch(r.branch_id, "coding_type", e.target.value)}
                  >
                    <option value="zybo">Zybo VC</option>
                    <option value="pcp_jv">PCP and JV</option>
                    <option value="none">None</option>
                  </select>
                </td>
                <td className="td">
                  <select
                    className="input py-1 text-sm"
                    value={r.default_supervisor_user_id ?? ""}
                    onChange={(e) =>
                      patch(
                        r.branch_id,
                        "default_supervisor_user_id",
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                  >
                    <option value="">— None —</option>
                    {supervisors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="td">
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(r.allow_suspense)}
                      onChange={(e) => patch(r.branch_id, "allow_suspense", e.target.checked ? 1 : 0)}
                    />
                    Allow
                  </label>
                </td>
                <td className="td">
                  <select
                    className="input py-1 text-sm"
                    value={r.charge_type_scope || "job_and_non_job"}
                    onChange={(e) => patch(r.branch_id, "charge_type_scope", e.target.value)}
                    disabled={r.request_mode === "compassion"}
                    title={
                      r.request_mode === "compassion"
                        ? "Compassion branches use truck/general charge types"
                        : undefined
                    }
                  >
                    {scopeOptions.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="td text-right">
                  <button
                    type="button"
                    className="btn-primary px-3 py-1 text-xs"
                    disabled={busyId === r.branch_id}
                    onClick={() => save(r)}
                  >
                    {busyId === r.branch_id ? "…" : savedId === r.branch_id ? "Saved" : "Save"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
