"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BankAccount } from "@/lib/types";

type Branch = { id: number; branch_name: string; branch_code: string };

export default function BankEditor({
  banks,
  branches,
}: {
  banks: BankAccount[];
  branches: Branch[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    id: 0,
    branch_id: branches[0]?.id ?? 0,
    bank_name: "",
    last_four: "",
    is_active: true,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function edit(b: BankAccount) {
    setForm({
      id: b.id,
      branch_id: b.branch_id,
      bank_name: b.bank_name,
      last_four: b.last_four,
      is_active: !!b.is_active,
    });
  }

  function reset() {
    setForm({
      id: 0,
      branch_id: branches[0]?.id ?? 0,
      bank_name: "",
      last_four: "",
      is_active: true,
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d.ok) setError(d.error || "Failed");
      else {
        reset();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <form onSubmit={save} className="card space-y-3 p-4">
        <p className="label">{form.id ? "Edit Bank Account" : "New Bank Account"}</p>
        <div>
          <label className="label">Branch</label>
          <select
            className="input"
            value={form.branch_id}
            onChange={(e) => setForm({ ...form, branch_id: Number(e.target.value) })}
            required
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.branch_name} ({b.branch_code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Bank name</label>
          <input
            className="input"
            placeholder="e.g. Emirates NBD"
            value={form.bank_name}
            onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Last 4 digits</label>
          <input
            className="input"
            inputMode="numeric"
            maxLength={4}
            placeholder="1234"
            value={form.last_four}
            onChange={(e) =>
              setForm({ ...form, last_four: e.target.value.replace(/\D/g, "").slice(0, 4) })
            }
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />{" "}
          Active
        </label>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex gap-2">
          <button className="btn-primary" disabled={busy || !form.branch_id}>
            {form.id ? "Update" : "Create"}
          </button>
          {form.id ? (
            <button type="button" className="btn-secondary" onClick={reset}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <div className="card overflow-x-auto md:col-span-2">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Branch</th>
              <th className="th">Bank</th>
              <th className="th">Account</th>
              <th className="th">Active</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {banks.length === 0 ? (
              <tr>
                <td className="td text-slate-500" colSpan={5}>
                  No bank accounts yet.
                </td>
              </tr>
            ) : (
              banks.map((b) => (
                <tr key={b.id}>
                  <td className="td">
                    <span className="font-medium">{b.branch_name || "—"}</span>
                    {b.branch_code ? (
                      <span className="ml-1 text-xs text-slate-400">{b.branch_code}</span>
                    ) : null}
                  </td>
                  <td className="td font-medium">{b.bank_name}</td>
                  <td className="td">****{b.last_four}</td>
                  <td className="td">{b.is_active ? "Yes" : "No"}</td>
                  <td className="td text-right">
                    <button className="text-sm text-brand-600 hover:underline" onClick={() => edit(b)}>
                      Edit
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
