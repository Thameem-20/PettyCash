"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import type { ApprovalPath } from "@/lib/approvalPolicy";
import {
  SUSPENSE_CHARGE_SCOPE_LABELS,
  type SuspenseChargeScope,
} from "@/lib/chargeTypePolicy";

type Policy = {
  branch_id: number;
  submitter_role: Role;
  approval_path: ApprovalPath;
  suspense_charge_scope?: SuspenseChargeScope;
};

type Exception = {
  id: number;
  user_id: number;
  branch_id: number | null;
  approval_path: ApprovalPath;
  note: string | null;
  user_name?: string;
  user_email?: string;
  branch_name?: string | null;
};

type CashReceiverOverride = {
  id: number;
  user_id: number;
  branch_id: number | null;
  allow_myself: number;
  allow_messenger: number;
  allow_supervisor: number;
  note: string | null;
  user_name?: string;
  user_email?: string;
  branch_name?: string | null;
};

type Branch = { id: number; branch_name: string; branch_code: string };
type UserOpt = { id: number; name: string; email: string; role: Role };

export default function PoliciesEditor({
  branches,
  policies: initial,
  exceptions: initialExceptions,
  cashReceiverOptions: initialCashReceiverOptions,
  users,
  submitterRoles,
  pathLabels,
}: {
  branches: Branch[];
  policies: Policy[];
  exceptions: Exception[];
  cashReceiverOptions: CashReceiverOverride[];
  users: UserOpt[];
  submitterRoles: Role[];
  pathLabels: Record<ApprovalPath, string>;
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? 0);
  const [policies, setPolicies] = useState(initial);
  const [exceptions, setExceptions] = useState(initialExceptions);
  const [receiverOverrides, setReceiverOverrides] = useState(initialCashReceiverOptions);
  const [busy, setBusy] = useState(false);
  const [exBusy, setExBusy] = useState(false);
  const [rxBusy, setRxBusy] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [exError, setExError] = useState("");
  const [exOk, setExOk] = useState("");
  const [rxError, setRxError] = useState("");
  const [rxOk, setRxOk] = useState("");
  const [exUserId, setExUserId] = useState(users[0]?.id ?? 0);
  const [exBranchId, setExBranchId] = useState<number | "all">("all");
  const [exPath, setExPath] = useState<ApprovalPath>("direct_accounts");
  const [exNote, setExNote] = useState("");

  const opsUsers = useMemo(
    () => users.filter((u) => u.role === "operations" || u.role === "admin"),
    [users]
  );
  const [rxUserId, setRxUserId] = useState(opsUsers[0]?.id ?? 0);
  const [rxBranchId, setRxBranchId] = useState<number | "all">("all");
  const [rxMyself, setRxMyself] = useState(true);
  const [rxMessenger, setRxMessenger] = useState(true);
  const [rxSupervisor, setRxSupervisor] = useState(true);
  const [rxNote, setRxNote] = useState("");

  const forBranch = useMemo(() => {
    const map = new Map<Role, { path: ApprovalPath; suspense: SuspenseChargeScope }>();
    for (const p of policies.filter((x) => x.branch_id === branchId)) {
      map.set(p.submitter_role, {
        path: p.approval_path,
        suspense: p.suspense_charge_scope || "inherit",
      });
    }
    return map;
  }, [policies, branchId]);

  function setPath(role: Role, path: ApprovalPath) {
    setPolicies((prev) => {
      const existing = prev.find(
        (p) => p.branch_id === branchId && p.submitter_role === role
      );
      const others = prev.filter(
        (p) => !(p.branch_id === branchId && p.submitter_role === role)
      );
      return [
        ...others,
        {
          branch_id: branchId,
          submitter_role: role,
          approval_path: path,
          suspense_charge_scope: existing?.suspense_charge_scope || "inherit",
        },
      ];
    });
  }

  function setSuspenseScope(role: Role, suspense: SuspenseChargeScope) {
    setPolicies((prev) => {
      const existing = prev.find(
        (p) => p.branch_id === branchId && p.submitter_role === role
      );
      const others = prev.filter(
        (p) => !(p.branch_id === branchId && p.submitter_role === role)
      );
      return [
        ...others,
        {
          branch_id: branchId,
          submitter_role: role,
          approval_path: existing?.approval_path || "supervisor_then_accounts",
          suspense_charge_scope: suspense,
        },
      ];
    });
  }

  async function save() {
    setBusy(true);
    setError("");
    setOkMsg("");
    try {
      const payload = submitterRoles.map((role) => {
        const row = forBranch.get(role);
        return {
          submitter_role: role,
          approval_path: row?.path || "supervisor_then_accounts",
          suspense_charge_scope: row?.suspense || "inherit",
        };
      });
      const res = await fetch("/api/admin/control-panel/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_id: branchId, policies: payload }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Could not save");
        return;
      }
      setPolicies((prev) => [
        ...prev.filter((p) => p.branch_id !== branchId),
        ...data.policies,
      ]);
      setOkMsg("Policies saved");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function addException(e: React.FormEvent) {
    e.preventDefault();
    setExBusy(true);
    setExError("");
    setExOk("");
    try {
      const res = await fetch("/api/admin/control-panel/policy-exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: exUserId,
          branch_id: exBranchId === "all" ? null : exBranchId,
          approval_path: exPath,
          note: exNote.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setExError(data.error || "Could not save exception");
        return;
      }
      setExceptions(data.exceptions || []);
      setExOk("Exception saved");
      setExNote("");
      router.refresh();
    } catch {
      setExError("Network error");
    } finally {
      setExBusy(false);
    }
  }

  async function removeException(id: number) {
    setExBusy(true);
    setExError("");
    setExOk("");
    try {
      const res = await fetch("/api/admin/control-panel/policy-exceptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!data.ok) {
        setExError(data.error || "Could not remove");
        return;
      }
      setExceptions(data.exceptions || []);
      setExOk("Exception removed");
      router.refresh();
    } catch {
      setExError("Network error");
    } finally {
      setExBusy(false);
    }
  }

  async function addReceiverOverride(e: React.FormEvent) {
    e.preventDefault();
    if (!rxMyself && !rxMessenger && !rxSupervisor) {
      setRxError("Select at least one cash receiver option");
      return;
    }
    setRxBusy(true);
    setRxError("");
    setRxOk("");
    try {
      const res = await fetch("/api/admin/control-panel/cash-receiver-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: rxUserId,
          branch_id: rxBranchId === "all" ? null : rxBranchId,
          allow_myself: rxMyself,
          allow_messenger: rxMessenger,
          allow_supervisor: rxSupervisor,
          note: rxNote.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setRxError(data.error || "Could not save override");
        return;
      }
      setReceiverOverrides(data.options || []);
      setRxOk("Cash receiver options saved");
      setRxNote("");
      router.refresh();
    } catch {
      setRxError("Network error");
    } finally {
      setRxBusy(false);
    }
  }

  async function removeReceiverOverride(id: number) {
    setRxBusy(true);
    setRxError("");
    setRxOk("");
    try {
      const res = await fetch("/api/admin/control-panel/cash-receiver-options", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!data.ok) {
        setRxError(data.error || "Could not remove");
        return;
      }
      setReceiverOverrides(data.options || []);
      setRxOk("Override removed");
      router.refresh();
    } catch {
      setRxError("Network error");
    } finally {
      setRxBusy(false);
    }
  }

  function formatReceiverOptions(row: CashReceiverOverride) {
    const parts = [] as string[];
    if (row.allow_myself) parts.push("Myself");
    if (row.allow_messenger) parts.push("Messenger");
    if (row.allow_supervisor) parts.push("Supervisor");
    return parts.length ? parts.join(", ") : "None";
  }

  const pathOptions = Object.entries(pathLabels) as [ApprovalPath, string][];
  const suspenseOptions = Object.entries(SUSPENSE_CHARGE_SCOPE_LABELS) as [
    SuspenseChargeScope,
    string,
  ][];

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Branch defaults</h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose how each submitter role is approved on this branch.{" "}
            <b>Suspense charge types</b> can restrict suspense/advance requests (e.g. non-job only)
            for that role, independent of exact reimbursements.
          </p>
        </div>

        <div className="max-w-sm">
          <label className="label">Branch</label>
          <select
            className="input"
            value={branchId}
            onChange={(e) => {
              setBranchId(Number(e.target.value));
              setOkMsg("");
              setError("");
            }}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.branch_name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-rose-700">{error}</p>}
        {okMsg && <p className="text-sm text-emerald-700">{okMsg}</p>}

        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Submitter role</th>
                <th className="th">Approval path</th>
                <th className="th">Suspense charge types</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submitterRoles.map((role) => (
                <tr key={role}>
                  <td className="td font-medium">{ROLE_LABELS[role]}</td>
                  <td className="td">
                    <select
                      className="input max-w-md py-1 text-sm"
                      value={forBranch.get(role)?.path || "supervisor_then_accounts"}
                      onChange={(e) => setPath(role, e.target.value as ApprovalPath)}
                    >
                      {pathOptions.map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="td">
                    <select
                      className="input max-w-xs py-1 text-sm"
                      value={forBranch.get(role)?.suspense || "inherit"}
                      onChange={(e) =>
                        setSuspenseScope(role, e.target.value as SuspenseChargeScope)
                      }
                    >
                      {suspenseOptions.map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="button" className="btn-primary" disabled={busy || !branchId} onClick={save}>
          {busy ? "Saving…" : "Save policies"}
        </button>
      </section>

      <section className="space-y-4 border-t border-slate-200 pt-8">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">User exceptions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Override the branch default for specific people. Example: Dubai is normally{" "}
            <b>Supervisor → Accounts</b>, but User A can be set to <b>Direct to Accounts</b> so their
            requests skip the supervisor. A branch-specific exception wins over an “All branches”
            exception.
          </p>
        </div>

        {exError && <p className="text-sm text-rose-700">{exError}</p>}
        {exOk && <p className="text-sm text-emerald-700">{exOk}</p>}

        <form
          onSubmit={addException}
          className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
        >
          <div className="lg:col-span-1">
            <label className="label">User</label>
            <select
              className="input"
              value={exUserId}
              onChange={(e) => setExUserId(Number(e.target.value))}
              required
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({ROLE_LABELS[u.role]})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Branch</label>
            <select
              className="input"
              value={exBranchId === "all" ? "all" : String(exBranchId)}
              onChange={(e) => {
                const v = e.target.value;
                setExBranchId(v === "all" ? "all" : Number(v));
              }}
            >
              <option value="all">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.branch_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Approval path</label>
            <select
              className="input"
              value={exPath}
              onChange={(e) => setExPath(e.target.value as ApprovalPath)}
            >
              {pathOptions.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Note (optional)</label>
            <input
              className="input"
              value={exNote}
              onChange={(e) => setExNote(e.target.value)}
              placeholder="Why this exception"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={exBusy || !exUserId}>
            {exBusy ? "Saving…" : "Add exception"}
          </button>
        </form>

        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">User</th>
                <th className="th">Branch</th>
                <th className="th">Approval path</th>
                <th className="th">Note</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exceptions.length === 0 ? (
                <tr>
                  <td className="td text-sm text-slate-500" colSpan={5}>
                    No user exceptions yet. Branch defaults apply to everyone.
                  </td>
                </tr>
              ) : (
                exceptions.map((ex) => (
                  <tr key={ex.id}>
                    <td className="td">
                      <span className="block font-medium">{ex.user_name}</span>
                      <span className="text-xs text-slate-400">{ex.user_email}</span>
                    </td>
                    <td className="td">{ex.branch_name || "All branches"}</td>
                    <td className="td">{pathLabels[ex.approval_path]}</td>
                    <td className="td text-sm text-slate-500">{ex.note || "—"}</td>
                    <td className="td text-right">
                      <button
                        type="button"
                        className="text-sm font-semibold text-rose-600 hover:underline"
                        disabled={exBusy}
                        onClick={() => removeException(ex.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4 border-t border-slate-200 pt-8">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Cash receiver options</h2>
          <p className="mt-1 text-sm text-slate-500">
            Control which cash receiver choices Ops users see on new requests (Myself, Messenger,
            Supervisor). With no override, all three options are shown. A branch-specific override
            wins over an “All branches” override.
          </p>
        </div>

        {rxError && <p className="text-sm text-rose-700">{rxError}</p>}
        {rxOk && <p className="text-sm text-emerald-700">{rxOk}</p>}

        <form
          onSubmit={addReceiverOverride}
          className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end"
        >
          <div>
            <label className="label">User</label>
            <select
              className="input"
              value={rxUserId}
              onChange={(e) => setRxUserId(Number(e.target.value))}
              required
            >
              {opsUsers.length === 0 ? (
                <option value={0}>No ops users</option>
              ) : (
                opsUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({ROLE_LABELS[u.role]})
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="label">Branch</label>
            <select
              className="input"
              value={rxBranchId === "all" ? "all" : String(rxBranchId)}
              onChange={(e) => {
                const v = e.target.value;
                setRxBranchId(v === "all" ? "all" : Number(v));
              }}
            >
              <option value="all">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.branch_name}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="label">Allowed options</label>
            <div className="flex flex-wrap gap-3 pt-2 text-sm text-slate-700">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={rxMyself}
                  onChange={(e) => setRxMyself(e.target.checked)}
                />
                Myself
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={rxMessenger}
                  onChange={(e) => setRxMessenger(e.target.checked)}
                />
                Messenger
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={rxSupervisor}
                  onChange={(e) => setRxSupervisor(e.target.checked)}
                />
                Supervisor
              </label>
            </div>
          </div>
          <div>
            <label className="label">Note (optional)</label>
            <input
              className="input"
              value={rxNote}
              onChange={(e) => setRxNote(e.target.value)}
              placeholder="Why this override"
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={rxBusy || !rxUserId || (!rxMyself && !rxMessenger && !rxSupervisor)}
          >
            {rxBusy ? "Saving…" : "Add override"}
          </button>
        </form>

        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">User</th>
                <th className="th">Branch</th>
                <th className="th">Allowed options</th>
                <th className="th">Note</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receiverOverrides.length === 0 ? (
                <tr>
                  <td className="td text-sm text-slate-500" colSpan={5}>
                    No overrides yet. Ops users see Myself, Messenger, and Supervisor.
                  </td>
                </tr>
              ) : (
                receiverOverrides.map((row) => (
                  <tr key={row.id}>
                    <td className="td">
                      <span className="block font-medium">{row.user_name}</span>
                      <span className="text-xs text-slate-400">{row.user_email}</span>
                    </td>
                    <td className="td">{row.branch_name || "All branches"}</td>
                    <td className="td">{formatReceiverOptions(row)}</td>
                    <td className="td text-sm text-slate-500">{row.note || "—"}</td>
                    <td className="td text-right">
                      <button
                        type="button"
                        className="text-sm font-semibold text-rose-600 hover:underline"
                        disabled={rxBusy}
                        onClick={() => removeReceiverOverride(row.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
