import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { resolveAccountsBranch, type AccountsBranch } from "@/lib/accountsBranch";
import { listBranchProfiles } from "@/lib/branchProfile";
import { listUserBranchRoles } from "@/lib/branchMembership";
import {
  APPROVAL_PATH_LABELS,
  listApprovalPolicies,
  listUserApprovalExceptions,
  POLICY_SUBMITTER_ROLES,
} from "@/lib/approvalPolicy";
import { PageHeader } from "@/components/page-chrome";
import Tabs from "@/components/Tabs";
import ProfilesEditor from "./ProfilesEditor";
import MembershipsEditor from "./MembershipsEditor";
import PoliciesEditor from "./PoliciesEditor";
import UserEditor from "../users/UserEditor";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "branches", label: "Branches" },
  { key: "users", label: "Users" },
  { key: "policies", label: "Approval policies" },
] as const;

export default async function ControlPanelPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  await requireRole(["admin"]);

  const tab = TABS.find((t) => t.key === searchParams.tab)?.key ?? "branches";

  const [
    profiles,
    memberships,
    policies,
    exceptions,
    profileSupervisors,
    usersFull,
    branchesFull,
    access,
    departments,
    userSupervisors,
  ] = await Promise.all([
    listBranchProfiles(),
    listUserBranchRoles(),
    listApprovalPolicies(),
    listUserApprovalExceptions(),
    query<{ id: number; name: string }>(
      `SELECT id, name FROM users
        WHERE is_active = 1 AND role IN ('supervisor','accounts_supervisor','admin')
        ORDER BY name`
    ),
    query(
      `SELECT u.id, u.name, u.email, u.role, u.department, u.default_branch_id, u.supervisor_id, u.is_active,
              b.branch_name AS default_branch_name
         FROM users u LEFT JOIN branches b ON b.id = u.default_branch_id
        ORDER BY u.role, u.name`
    ),
    query<AccountsBranch>(
      "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
    ),
    query("SELECT user_id, branch_id FROM user_branch_access"),
    query<{ department: string }>(
      "SELECT DISTINCT department FROM users WHERE department IS NOT NULL AND department != '' ORDER BY department"
    ),
    query("SELECT id, name FROM users WHERE role = 'supervisor' AND is_active = 1 ORDER BY name"),
  ]);

  const defaultBranchId = branchesFull.length
    ? resolveAccountsBranch(undefined, branchesFull)
    : 0;

  return (
    <div>
      <PageHeader
        title="Control Panel"
        subtitle="Configure branches, users, memberships, and approval paths"
      />
      <Tabs tabs={[...TABS]} current={tab} />

      {tab === "branches" && (
        <ProfilesEditor
          profiles={JSON.parse(JSON.stringify(profiles))}
          supervisors={JSON.parse(JSON.stringify(profileSupervisors))}
        />
      )}

      {tab === "users" && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-1 text-sm font-semibold text-slate-800">User accounts</h2>
            <p className="mb-4 text-sm text-slate-500">
              Create and edit users, primary role, default branch, and branch access for accounts,
              accounts supervisors, and supervisors.
            </p>
            <UserEditor
              users={JSON.parse(JSON.stringify(usersFull))}
              branches={JSON.parse(JSON.stringify(branchesFull))}
              supervisors={JSON.parse(JSON.stringify(userSupervisors))}
              access={JSON.parse(JSON.stringify(access))}
              supervisorAccess={JSON.parse(
                JSON.stringify(
                  memberships
                    .filter((m) => m.role === "supervisor")
                    .map((m) => ({ user_id: m.user_id, branch_id: m.branch_id }))
                )
              )}
              accountsSupervisorAccess={JSON.parse(
                JSON.stringify(
                  (() => {
                    const fromMemberships = memberships
                      .filter((m) => m.role === "accounts_supervisor")
                      .map((m) => ({ user_id: m.user_id, branch_id: m.branch_id }));
                    const accSupIds = new Set(
                      (usersFull as { id: number; role: Role }[])
                        .filter((u) => u.role === "accounts_supervisor")
                        .map((u) => u.id)
                    );
                    const fromAccess = (access as { user_id: number; branch_id: number }[])
                      .filter((a) => accSupIds.has(a.user_id))
                      .map((a) => ({ user_id: a.user_id, branch_id: a.branch_id }));
                    const key = (r: { user_id: number; branch_id: number }) =>
                      `${r.user_id}:${r.branch_id}`;
                    const map = new Map<string, { user_id: number; branch_id: number }>();
                    for (const r of [...fromMemberships, ...fromAccess]) map.set(key(r), r);
                    return [...map.values()];
                  })()
                )
              )}
              departments={departments.map((d) => d.department)}
              defaultBranchId={defaultBranchId}
            />
          </section>

          <section className="border-t border-slate-200 pt-6">
            <h2 className="mb-1 text-sm font-semibold text-slate-800">Branch roles (memberships)</h2>
            <p className="mb-4 text-sm text-slate-500">
              Assign a role per branch so the same person can be supervisor in one place and
              cash requester in another.
            </p>
            <MembershipsEditor
              users={JSON.parse(
                JSON.stringify(
                  (usersFull as { id: number; name: string; email: string; role: Role; is_active: number }[]).map(
                    (u) => ({
                      id: u.id,
                      name: u.name,
                      email: u.email,
                      role: u.role,
                      is_active: u.is_active,
                    })
                  )
                )
              )}
              branches={JSON.parse(JSON.stringify(branchesFull))}
              memberships={JSON.parse(
                JSON.stringify(
                  memberships.map((m) => ({
                    user_id: m.user_id,
                    branch_id: m.branch_id,
                    role: m.role,
                  }))
                )
              )}
            />
          </section>
        </div>
      )}

      {tab === "policies" && (
        <PoliciesEditor
          branches={JSON.parse(JSON.stringify(branchesFull))}
          policies={JSON.parse(
            JSON.stringify(
              policies.map((p) => ({
                branch_id: p.branch_id,
                submitter_role: p.submitter_role,
                approval_path: p.approval_path,
                suspense_charge_scope: p.suspense_charge_scope,
              }))
            )
          )}
          exceptions={JSON.parse(JSON.stringify(exceptions))}
          users={JSON.parse(
            JSON.stringify(
              (usersFull as { id: number; name: string; email: string; role: Role; is_active: number }[])
                .filter((u) => u.is_active)
                .map((u) => ({
                  id: u.id,
                  name: u.name,
                  email: u.email,
                  role: u.role,
                }))
            )
          )}
          submitterRoles={[...POLICY_SUBMITTER_ROLES]}
          pathLabels={APPROVAL_PATH_LABELS}
        />
      )}
    </div>
  );
}
