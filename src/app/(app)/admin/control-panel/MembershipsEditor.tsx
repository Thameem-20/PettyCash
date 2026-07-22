"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/lib/types";

type Membership = {
  user_id: number;
  branch_id: number;
  role: Role;
};

type User = { id: number; name: string; email: string; role: Role; is_active: number };
type Branch = { id: number; branch_name: string; branch_code: string };

const ROLES = Object.keys(ROLE_LABELS) as Role[];

export default function MembershipsEditor({
  users,
  branches,
  memberships: initial,
}: {
  users: User[];
  branches: Branch[];
  memberships: Membership[];
}) {
  const router = useRouter();
  const [userId, setUserId] = useState(users[0]?.id ?? 0);
  const [memberships, setMemberships] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const forUser = useMemo(
    () => memberships.filter((m) => m.user_id === userId),
    [memberships, userId]
  );

  const selectedUser = users.find((u) => u.id === userId);

  function setRoleForBranch(branchId: number, role: Role | "") {
    setMemberships((prev) => {
      const others = prev.filter((m) => !(m.user_id === userId && m.branch_id === branchId));
      if (!role) return others;
      return [...others, { user_id: userId, branch_id: branchId, role }];
    });
  }

  async function save() {
    setBusy(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch("/api/admin/control-panel/memberships", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          memberships: forUser.map((m) => ({ branch_id: m.branch_id, role: m.role })),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Could not save");
        return;
      }
      setMemberships((prev) => [
        ...prev.filter((m) => m.user_id !== userId),
        ...data.memberships.map((m: Membership & { id?: number }) => ({
          user_id: m.user_id,
          branch_id: m.branch_id,
          role: m.role,
        })),
      ]);
      setOkMsg("Memberships saved");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Assign a role per branch. A user can be supervisor in one branch and cash requester in
        another.
        Primary role on the user record remains the login fallback.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem]">
          <label className="label">User</label>
          <select
            className="input"
            value={userId}
            onChange={(e) => {
              setUserId(Number(e.target.value));
              setOkMsg("");
              setError("");
            }}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({ROLE_LABELS[u.role]})
                {!u.is_active ? " — inactive" : ""}
              </option>
            ))}
          </select>
        </div>
        {selectedUser && (
          <p className="pb-2 text-xs text-slate-500">
            Primary: <span className="font-medium">{ROLE_LABELS[selectedUser.role]}</span>
          </p>
        )}
      </div>

      {error && <p className="text-sm text-rose-700">{error}</p>}
      {okMsg && <p className="text-sm text-emerald-700">{okMsg}</p>}

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Branch</th>
              <th className="th">Role in this branch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {branches.map((b) => {
              const current = forUser.find((m) => m.branch_id === b.id)?.role ?? "";
              return (
                <tr key={b.id}>
                  <td className="td">
                    {b.branch_name}{" "}
                    <span className="text-xs text-slate-400">{b.branch_code}</span>
                  </td>
                  <td className="td">
                    <select
                      className="input max-w-xs py-1 text-sm"
                      value={current}
                      onChange={(e) =>
                        setRoleForBranch(b.id, (e.target.value || "") as Role | "")
                      }
                    >
                      <option value="">— No membership —</option>
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button type="button" className="btn-primary" disabled={busy || !userId} onClick={save}>
        {busy ? "Saving…" : "Save memberships"}
      </button>
    </div>
  );
}
