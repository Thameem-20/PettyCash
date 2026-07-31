import { requireSession } from "@/lib/session";
import { query } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/rbac";
import {
  allowAllBranchesForRole,
  resolveTopBarBranch,
  type AccountsBranch,
} from "@/lib/accountsBranch";
import { listWorkspaceBranchesForUser } from "@/lib/branchMembership";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";
import { PageHeader } from "@/components/page-chrome";
import BranchPreference from "./BranchPreference";
import PushNotifications from "./PushNotifications";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const primary = session.primary_role || session.role;
  const allowAll = allowAllBranchesForRole(primary);

  const memberships = await listWorkspaceBranchesForUser(session.id);
  const membershipById = new Map(memberships.map((b) => [b.id, b]));

  // Elevated roles can pick any active branch; others only Control Panel memberships.
  const pickList: AccountsBranch[] = allowAll
    ? await query(
        "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
      )
    : memberships.map((b) => ({
        id: b.id,
        branch_name: b.branch_name,
        branch_code: b.branch_code,
      }));

  const canPickBranch = pickList.length > 0;
  const activeParam = resolveActiveBranchParam(session.preferred_branch_param);
  const active = canPickBranch
    ? resolveTopBarBranch(activeParam, pickList, allowAll)
    : null;

  const initials = session.name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const activeLabel =
    active === "all"
      ? "All Branches"
      : typeof active === "number"
        ? pickList.find((b) => b.id === active)?.branch_name ?? "Branch"
        : null;

  const activeMembershipRole =
    typeof active === "number" ? membershipById.get(active)?.membership_role ?? null : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" subtitle="Your profile and workspace preferences" />

      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-brand-600 via-brand-500 to-sky-500" />
        <div className="relative px-5 pb-5 pt-14 sm:px-7 sm:pb-7 sm:pt-16">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-white bg-slate-900 text-lg font-bold text-white shadow-md">
                {initials || "?"}
              </div>
              <div className="pb-1">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">{session.name}</h2>
                <p className="text-sm text-slate-500">{session.email}</p>
              </div>
            </div>
            <span className="inline-flex w-fit items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-200">
              {ROLE_LABELS[session.role]}
              {activeMembershipRole && activeMembershipRole !== session.role
                ? ` · ${ROLE_LABELS[activeMembershipRole]} here`
                : ""}
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Workspace branch
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {activeLabel || (pickList[0]?.branch_name ?? "Not set")}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Selectable branches
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {pickList.length === 0 ? "None" : String(pickList.length)}
              </p>
            </div>
          </div>

          {memberships.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Control Panel memberships
              </p>
              <div className="flex flex-wrap gap-2">
                {memberships.map((b) => {
                  const isActive = active === b.id;
                  return (
                    <span
                      key={b.id}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                        isActive
                          ? "bg-brand-600 text-white"
                          : "bg-white text-slate-700 ring-1 ring-slate-200"
                      }`}
                    >
                      {b.branch_name}
                      {b.membership_role ? (
                        <span className={isActive ? "text-brand-100" : "text-slate-400"}>
                          {ROLE_LABELS[b.membership_role]}
                        </span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {canPickBranch ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">Active branch</h2>
          <p className="mt-1 text-sm text-slate-500">
            You can also switch branches from the top bar. Your role and menus follow the
            membership set in Control Panel for that branch.
          </p>
          <div className="mt-4">
            <BranchPreference
              branches={pickList}
              current={active ?? pickList[0].id}
              allowAll={allowAll}
            />
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-4 text-sm text-slate-600">
          No branch memberships yet. Ask an admin to assign you branches in Control Panel.
        </section>
      )}

      <PushNotifications />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Account</h2>
        <p className="mt-1 text-sm text-slate-500">Sign out of Petty Cash on this device.</p>
        <div className="mt-4">
          <LogoutButton className="btn-secondary border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800" />
        </div>
      </section>
    </div>
  );
}
