"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExpenseCategory } from "@/lib/types";

export default function CategoryEditor({ categories }: { categories: ExpenseCategory[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ id: 0, category_name: "", charge_type: "non_job", job_number_required: false, is_active: true });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function edit(c: ExpenseCategory) {
    setForm({
      id: c.id,
      category_name: c.category_name,
      charge_type: c.charge_type,
      job_number_required: !!c.job_number_required,
      is_active: !!c.is_active,
    });
  }
  function reset() {
    setForm({ id: 0, category_name: "", charge_type: "non_job", job_number_required: false, is_active: true });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/categories", {
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
        <p className="label">{form.id ? "Edit Category" : "New Category"}</p>
        <input className="input" placeholder="Category name" value={form.category_name} onChange={(e) => setForm({ ...form, category_name: e.target.value })} />
        <select className="input" value={form.charge_type} onChange={(e) => setForm({ ...form, charge_type: e.target.value })}>
          <option value="non_job">Non Job Related</option>
          <option value="job">Job Related</option>
          <option value="truck_trailer">Truck / Trailer (Compassion)</option>
          <option value="general">General (Compassion)</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={form.job_number_required || form.charge_type === "job"} disabled={form.charge_type === "job"} onChange={(e) => setForm({ ...form, job_number_required: e.target.checked })} /> Job number required
        </label>
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
              <th className="th">Category</th>
              <th className="th">Charge Type</th>
              <th className="th">Job No. Required</th>
              <th className="th">Active</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((c) => (
              <tr key={c.id}>
                <td className="td font-medium">{c.category_name}</td>
                <td className="td">
                  {c.charge_type === "job"
                    ? "Job"
                    : c.charge_type === "truck_trailer"
                      ? "Truck / Trailer"
                      : c.charge_type === "general"
                        ? "General"
                        : "Non Job"}
                </td>
                <td className="td">{c.job_number_required ? "Yes" : "No"}</td>
                <td className="td">{c.is_active ? "Yes" : "No"}</td>
                <td className="td text-right">
                  <button className="text-sm text-brand-600 hover:underline" onClick={() => edit(c)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
