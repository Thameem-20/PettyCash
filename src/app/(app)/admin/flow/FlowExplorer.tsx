"use client";

import { useEffect, useMemo, useState } from "react";
import type { Role } from "@/lib/types";

interface U {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: number;
}

interface FlowNode {
  kind: "requester" | "supervisor" | "accounts" | "accounts_supervisor";
  label: string;
  user: { id: number; name: string; email: string } | null;
  note: string | null;
  warning: string | null;
}

interface BranchFlow {
  branch_id: number;
  branch_name: string;
  effective_role: Role;
  approval_path: string;
  approval_path_label: string;
  nodes: FlowNode[];
}

interface FlowUpstream {
  personalSupervisees: {
    id: number;
    name: string;
    branch_id: number | null;
    branch_name: string | null;
    valid: boolean;
  }[];
  supervisorBranches: {
    branch_id: number;
    branch_name: string;
    source: "branch_default" | "branch_membership";
  }[];
  accountsBranches: { branch_id: number; branch_name: string }[];
  accountsSupervisorScope: "all" | "assigned" | null;
  accountsSupervisorBranches: { branch_id: number; branch_name: string }[];
}

interface FlowResponse {
  user: {
    id: number;
    name: string;
    email: string;
    role: Role;
    department: string | null;
    default_branch_id: number | null;
    default_branch_name: string | null;
    supervisor_id: number | null;
    supervisor_name: string | null;
    is_active: number;
  };
  downstream: BranchFlow[];
  upstream: FlowUpstream;
}

function NodeCard({ node }: { node: FlowNode }) {
  return (
    <div
      className={`min-w-[13rem] max-w-[15rem] border px-3 py-2 text-sm ${
        node.warning
          ? "border-amber-300 bg-amber-50"
          : node.user
          ? "border-brand-200 bg-brand-50/50"
          : "border-slate-300 bg-slate-50"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{node.label}</p>
      {node.user ? (
        <p className="font-medium text-slate-800">{node.user.name}</p>
      ) : (
        <p className="font-medium text-slate-400">Unassigned</p>
      )}
      {node.note && <p className="mt-0.5 text-xs text-slate-500">{node.note}</p>}
      {node.warning && <p className="mt-1 text-xs text-amber-700">⚠ {node.warning}</p>}
    </div>
  );
}

function Arrow() {
  return <span className="shrink-0 self-center px-1 text-slate-300">→</span>;
}

function BranchFlowRow({ flow }: { flow: BranchFlow }) {
  return (
    <div className="border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{flow.branch_name}</p>
        <span className="border border-slate-300 px-2 py-0.5 text-xs text-slate-500">
          {flow.approval_path_label}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1 overflow-x-auto">
        {flow.nodes.map((n, i) => (
          <div key={`${n.kind}-${i}`} className="flex items-center">
            <NodeCard node={n} />
            {i < flow.nodes.length - 1 && <Arrow />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FlowExplorer({
  users,
  roleLabels,
}: {
  users: U[];
  roleLabels: Record<Role, string>;
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [data, setData] = useState<FlowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [users, search, roleFilter]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/admin/flow?userId=${selectedId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.ok) {
          setError(d.error || "Could not load flow");
          setData(null);
          return;
        }
        setData(d as FlowResponse);
      })
      .catch(() => {
        if (!cancelled) setError("Network error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      <div className="card space-y-3 p-4">
        <div>
          <label className="label" htmlFor="flow-search">
            Search users
          </label>
          <input
            id="flow-search"
            className="input"
            type="search"
            placeholder="Name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="flow-role-filter">
            Role
          </label>
          <select
            id="flow-role-filter"
            className="input"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "all")}
          >
            <option value="all">All roles</option>
            {(Object.keys(roleLabels) as Role[]).map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="max-h-[28rem] space-y-1 overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No users match.</p>
          ) : (
            filteredUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setSelectedId(u.id)}
                className={`block w-full border px-3 py-2 text-left text-sm transition ${
                  selectedId === u.id
                    ? "border-brand-500 bg-brand-50 text-brand-800"
                    : "border-slate-200 hover:bg-slate-50"
                } ${!u.is_active ? "opacity-50" : ""}`}
              >
                <span className="block font-medium">{u.name}</span>
                <span className="text-xs text-slate-400">
                  {roleLabels[u.role]}
                  {!u.is_active ? " — inactive" : ""}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="space-y-4">
        {!selectedId && (
          <div className="card flex h-full min-h-[16rem] items-center justify-center p-8 text-center text-sm text-slate-400">
            Select a user on the left to see their approval flow.
          </div>
        )}

        {selectedId && loading && (
          <div className="card p-8 text-center text-sm text-slate-400">Loading flow…</div>
        )}

        {selectedId && !loading && error && (
          <div className="card border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        )}

        {selectedId && !loading && !error && data && (
          <>
            <div className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-semibold text-slate-800">{data.user.name}</p>
                  <p className="text-sm text-slate-500">{data.user.email}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="border border-slate-300 px-2 py-1 text-slate-600">
                    {roleLabels[data.user.role]}
                  </span>
                  {data.user.default_branch_name && (
                    <span className="border border-slate-300 px-2 py-1 text-slate-600">
                      Default branch: {data.user.default_branch_name}
                    </span>
                  )}
                  {data.user.supervisor_name && (
                    <span className="border border-slate-300 px-2 py-1 text-slate-600">
                      Personal supervisor: {data.user.supervisor_name}
                    </span>
                  )}
                  {!data.user.is_active && (
                    <span className="border border-rose-300 bg-rose-50 px-2 py-1 text-rose-700">
                      Inactive
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="card space-y-3 p-4">
              <h3 className="text-sm font-semibold text-slate-800">
                As a requester — where their requests go
              </h3>
              {data.downstream.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No branch context found for this user (no default branch or memberships).
                </p>
              ) : (
                <div className="space-y-2">
                  {data.downstream.map((f) => (
                    <BranchFlowRow key={f.branch_id} flow={f} />
                  ))}
                </div>
              )}
            </div>

            {(data.upstream.personalSupervisees.length > 0 ||
              data.upstream.supervisorBranches.length > 0 ||
              data.upstream.accountsBranches.length > 0 ||
              data.upstream.accountsSupervisorScope) && (
              <div className="card space-y-4 p-4">
                <h3 className="text-sm font-semibold text-slate-800">
                  As part of someone else&apos;s flow — who routes to them
                </h3>

                {data.upstream.personalSupervisees.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Personal supervisees
                    </p>
                    <ul className="space-y-1 text-sm">
                      {data.upstream.personalSupervisees.map((s) => (
                        <li key={s.id} className="flex items-center gap-2">
                          <span className={s.valid ? "text-slate-700" : "text-amber-700"}>
                            {s.name}
                            {s.branch_name ? ` (${s.branch_name})` : ""}
                          </span>
                          {!s.valid && (
                            <span className="text-xs text-amber-700">
                              ⚠ not assigned as supervisor on this branch — routes elsewhere
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.upstream.supervisorBranches.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Supervises by branch
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {data.upstream.supervisorBranches.map((b) => (
                        <span key={b.branch_id} className="border border-slate-300 px-2 py-1 text-slate-600">
                          {b.branch_name}
                          <span className="ml-1 text-slate-400">
                            ({b.source === "branch_default" ? "branch default" : "membership"})
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {data.upstream.accountsBranches.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Handles accounts for
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {data.upstream.accountsBranches.map((b) => (
                        <span key={b.branch_id} className="border border-slate-300 px-2 py-1 text-slate-600">
                          {b.branch_name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {data.upstream.accountsSupervisorScope && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Accounts supervisor scope
                    </p>
                    {data.upstream.accountsSupervisorScope === "all" ? (
                      <p className="text-sm text-slate-600">All branches (no restriction assigned).</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 text-xs">
                        {data.upstream.accountsSupervisorBranches.map((b) => (
                          <span key={b.branch_id} className="border border-slate-300 px-2 py-1 text-slate-600">
                            {b.branch_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
