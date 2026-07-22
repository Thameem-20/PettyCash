"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Code {
  id: number;
  job_code: string;
  branch_id: number;
  branch_name: string;
  description: string | null;
  is_active: number;
}

export default function JobCodeEditor({
  codes,
  branches,
  defaultBranchId,
}: {
  codes: Code[];
  branches: { id: number; branch_name: string }[];
  defaultBranchId: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    id: 0,
    job_code: "",
    branch_id: defaultBranchId,
    description: "",
    is_active: true,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function edit(c: Code) {
    setForm({ id: c.id, job_code: c.job_code, branch_id: c.branch_id, description: c.description || "", is_active: !!c.is_active });
  }
  function reset() {
    setForm({ id: 0, job_code: "", branch_id: defaultBranchId, description: "", is_active: true });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/job-codes", {
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
        <p className="label">{form.id ? "Edit Job Code" : "New Job Code"}</p>
        <input className="input" placeholder="Job code (e.g. 101)" value={form.job_code} onChange={(e) => setForm({ ...form, job_code: e.target.value })} />
        <select className="input" value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: Number(e.target.value) })}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.branch_name}</option>
          ))}
        </select>
        <input className="input" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
              <th className="th">Job Code</th>
              <th className="th">Branch</th>
              <th className="th">Description</th>
              <th className="th">Active</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {codes.map((c) => (
              <tr key={c.id}>
                <td className="td font-medium">{c.job_code}</td>
                <td className="td">{c.branch_name}</td>
                <td className="td text-slate-500">{c.description || "-"}</td>
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
