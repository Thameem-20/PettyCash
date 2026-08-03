"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS } from "@/lib/rbac";
import { Role } from "@/lib/types";

interface U {
  id: number;
  name: string;
  email: string;
  role: Role;
  department: string | null;
  default_branch_id: number | null;
  default_branch_name: string | null;
  supervisor_id: number | null;
  is_active: number;
}
interface Branch {
  id: number;
  branch_name: string;
}
interface Access {
  user_id: number;
  branch_id: number;
}

type AssignmentKind = "accounts" | "accounts_supervisor" | "supervisor" | "treasury";

const ROLES = Object.keys(ROLE_LABELS) as Role[];
const emptyForm = (defaultBranchId: number) => ({
  id: 0,
  name: "",
  email: "",
  password: "",
  role: "cash_requester" as Role,
  department: "",
  default_branch_id: defaultBranchId,
  supervisor_id: 0,
  is_active: true,
});

export default function UserEditor({
  users,
  branches,
  supervisors,
  access,
  supervisorAccess,
  accountsSupervisorAccess,
  treasuryAccess,
  departments,
  defaultBranchId,
}: {
  users: U[];
  branches: Branch[];
  supervisors: { id: number; name: string }[];
  access: Access[];
  supervisorAccess: Access[];
  accountsSupervisorAccess: Access[];
  treasuryAccess: Access[];
  departments: string[];
  defaultBranchId: number;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm(defaultBranchId));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [accountsSupervisorOpen, setAccountsSupervisorOpen] = useState(false);
  const [supervisorOpen, setSupervisorOpen] = useState(false);
  const [treasuryOpen, setTreasuryOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");

  const isEdit = form.id > 0;

  const supervisorBranchWarning = useMemo(() => {
    if (!form.supervisor_id || !form.default_branch_id) return null;
    const hasMembership = supervisorAccess.some(
      (a) => a.user_id === form.supervisor_id && a.branch_id === form.default_branch_id
    );
    if (hasMembership) return null;
    const supName = supervisors.find((s) => s.id === form.supervisor_id)?.name || "This supervisor";
    const branchName =
      branches.find((b) => b.id === form.default_branch_id)?.branch_name || "the selected branch";
    return `${supName} isn't assigned as a supervisor on ${branchName} yet, so requests will route to the branch's default supervisor instead. Add ${supName} under "Branch roles (memberships)" for ${branchName} to have their personal requests reach them.`;
  }, [form.supervisor_id, form.default_branch_id, supervisorAccess, supervisors, branches]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.department || "").toLowerCase().includes(q) ||
        (u.default_branch_name || "").toLowerCase().includes(q) ||
        ROLE_LABELS[u.role].toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  const departmentOptions = [...departments];
  if (form.department && !departmentOptions.includes(form.department)) {
    departmentOptions.push(form.department);
    departmentOptions.sort((a, b) => a.localeCompare(b));
  }

  function openCreate() {
    setForm(emptyForm(defaultBranchId));
    setError("");
    setModalOpen(true);
  }

  function openEdit(u: U) {
    setForm({
      id: u.id,
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      department: u.department || "",
      default_branch_id: u.default_branch_id || 0,
      supervisor_id: u.supervisor_id || 0,
      is_active: !!u.is_active,
    });
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setForm(emptyForm(defaultBranchId));
    setError("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          default_branch_id: form.default_branch_id || null,
          supervisor_id: form.supervisor_id || null,
        }),
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error || "Failed");
        return;
      }
      closeModal();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleAccess(
    userId: number,
    branchId: number,
    has: boolean,
    kind: AssignmentKind
  ) {
    await fetch("/api/admin/user-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        branch_id: branchId,
        action: has ? "remove" : "add",
        kind,
      }),
    });
    router.refresh();
  }

  function BranchToggleRow({
    user,
    kind,
    rows,
  }: {
    user: U;
    kind: AssignmentKind;
    rows: Access[];
  }) {
    return (
      <div className="border border-slate-300 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">{user.name}</p>
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => {
            const has = rows.some((a) => a.user_id === user.id && a.branch_id === b.id);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => toggleAccess(user.id, b.id, has, kind)}
                className={`border px-3 py-1 text-xs font-medium ${
                  has
                    ? "border-brand-600 bg-brand-100 text-brand-800"
                    : "border-slate-300 text-slate-500"
                }`}
              >
                {b.branch_name}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function AssignmentSection({
    title,
    hint,
    open,
    setOpen,
    role,
    emptyLabel,
    kind,
    rows,
  }: {
    title: string;
    hint: string;
    open: boolean;
    setOpen: (v: boolean | ((o: boolean) => boolean)) => void;
    role: Role;
    emptyLabel: string;
    kind: AssignmentKind;
    rows: Access[];
  }) {
    const list = users.filter((u) => u.role === role);
    return (
      <div className="card overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <div>
            <p className="label mb-0">{title}</p>
            <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
          </div>
          <span
            className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▾
          </span>
        </button>
        {open && (
          <div className="space-y-3 border-t border-slate-200 px-4 py-3">
            {list.length === 0 ? (
              <p className="text-sm text-slate-500">{emptyLabel}</p>
            ) : (
              list.map((u) => <BranchToggleRow key={u.id} user={u} kind={kind} rows={rows} />)
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
          <div>
            <label className="label" htmlFor="user-search">
              Search users
            </label>
            <input
              id="user-search"
              className="input"
              type="search"
              placeholder="Name, email, department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="user-role-filter">
              Role
            </label>
            <select
              id="user-role-filter"
              className="input"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as Role | "all")}
            >
              <option value="all">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="button" className="btn-primary shrink-0" onClick={openCreate}>
          + Create User
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Name</th>
              <th className="th">Role</th>
              <th className="th">Default Branch</th>
              <th className="th">Active</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredUsers.length === 0 ? (
              <tr>
                <td className="td text-sm text-slate-500" colSpan={5}>
                  No users match your search or role filter.
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td className="td">
                    <span className="block font-medium">{u.name}</span>
                    <span className="text-xs text-slate-400">{u.email}</span>
                  </td>
                  <td className="td">{ROLE_LABELS[u.role]}</td>
                  <td className="td">{u.default_branch_name || "-"}</td>
                  <td className="td">{u.is_active ? "Yes" : "No"}</td>
                  <td className="td text-right">
                    <button
                      className="text-sm font-semibold text-brand-600 hover:underline"
                      onClick={() => openEdit(u)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AssignmentSection
        title="Accounts Branch Assignments"
        hint="Toggle which branches each accounts user can handle."
        open={accountsOpen}
        setOpen={setAccountsOpen}
        role="accounts"
        emptyLabel="No accounts users yet."
        kind="accounts"
        rows={access}
      />

      <AssignmentSection
        title="Accounts Supervisor Branch Assignments"
        hint="Toggle which branches each accounts supervisor can oversee. With no branches selected they keep access to all branches."
        open={accountsSupervisorOpen}
        setOpen={setAccountsSupervisorOpen}
        role="accounts_supervisor"
        emptyLabel="No accounts supervisor users yet."
        kind="accounts_supervisor"
        rows={accountsSupervisorAccess}
      />

      <AssignmentSection
        title="Treasury Branch Assignments"
        hint="Toggle which branches each treasury user can handle. With no branches selected they keep access to all branches."
        open={treasuryOpen}
        setOpen={setTreasuryOpen}
        role="treasury"
        emptyLabel="No treasury users yet."
        kind="treasury"
        rows={treasuryAccess}
      />

      <AssignmentSection
        title="Supervisor Branch Assignments"
        hint="Toggle which branches each supervisor can approve."
        open={supervisorOpen}
        setOpen={setSupervisorOpen}
        role="supervisor"
        emptyLabel="No supervisor users yet."
        kind="supervisor"
        rows={supervisorAccess}
      />

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-lg">
            <div className="flex items-center justify-between border-b border-slate-300 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-800">
                {isEdit ? `Edit User #${form.id}` : "Create User"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={save} className="space-y-4 p-5">
              <div>
                <label className="label">Name</label>
                <input
                  className="input"
                  placeholder="Full name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  className="input"
                  type="email"
                  placeholder="email@company.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">{isEdit ? "New Password (optional)" : "Password"}</label>
                <input
                  className="input"
                  type="password"
                  placeholder={isEdit ? "Leave blank to keep current" : "Password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!isEdit}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Role</label>
                  <select
                    className="input"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Department</label>
                  <select
                    className="input"
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                  >
                    <option value="">Select department</option>
                    {departmentOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Default Branch</label>
                  <select
                    className="input"
                    value={form.default_branch_id}
                    onChange={(e) => setForm({ ...form, default_branch_id: Number(e.target.value) })}
                  >
                    <option value={0}>None</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.branch_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Supervisor</label>
                  <select
                    className="input"
                    value={form.supervisor_id}
                    onChange={(e) => setForm({ ...form, supervisor_id: Number(e.target.value) })}
                  >
                    <option value={0}>None</option>
                    {supervisors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {supervisorBranchWarning && (
                <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  ⚠ {supervisorBranchWarning}
                </p>
              )}

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Active user
              </label>

              {error && (
                <p className="border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
              )}

              <div className="flex gap-2 border-t border-slate-300 pt-4">
                <button type="button" className="btn-secondary flex-1" onClick={closeModal} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={busy}>
                  {busy ? "Saving..." : isEdit ? "Update User" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
