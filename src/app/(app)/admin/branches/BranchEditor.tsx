"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Branch } from "@/lib/types";
import { money } from "@/lib/util";

export default function BranchEditor({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ id: 0, branch_name: "", branch_code: "", currency: "AED", opening_balance: "", is_active: true });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function edit(b: Branch) {
    setForm({
      id: b.id,
      branch_name: b.branch_name,
      branch_code: b.branch_code,
      currency: b.currency,
      opening_balance: String(b.opening_balance),
      is_active: !!b.is_active,
    });
  }
  function reset() {
    setForm({ id: 0, branch_name: "", branch_code: "", currency: "AED", opening_balance: "", is_active: true });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/branches", {
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
        <p className="label">{form.id ? "Edit Branch" : "New Branch"}</p>
        <input className="input" placeholder="Branch name" value={form.branch_name} onChange={(e) => setForm({ ...form, branch_name: e.target.value })} />
        <input className="input" placeholder="Branch code" value={form.branch_code} onChange={(e) => setForm({ ...form, branch_code: e.target.value })} />
        {!form.id && (
          <input className="input" type="number" step="0.01" placeholder="Opening balance" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active
        </label>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex gap-2">
          <button className="btn-primary" disabled={busy}>{form.id ? "Update" : "Create"}</button>
          {form.id ? <button type="button" className="btn-secondary" onClick={reset}>Cancel</button> : null}
        </div>
      </form>

      <div className="card overflow-x-auto md:col-span-2">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Branch</th>
              <th className="th">Code</th>
              <th className="th text-right">Cash Balance</th>
              <th className="th">Active</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {branches.map((b) => (
              <tr key={b.id}>
                <td className="td font-medium">{b.branch_name}</td>
                <td className="td">{b.branch_code}</td>
                <td className="td text-right">{money(b.current_cash_balance, b.currency)}</td>
                <td className="td">{b.is_active ? "Yes" : "No"}</td>
                <td className="td text-right">
                  <button className="text-sm text-brand-600 hover:underline" onClick={() => edit(b)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
