import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { getBranchProfile } from "@/lib/branchProfile";
import {
  getUserRoleForBranch,
  listWorkspaceBranchesForUser,
  resolveRequestSupervisor,
} from "@/lib/branchMembership";
import { APPROVAL_PATH_LABELS, getApprovalPath } from "@/lib/approvalPolicy";
import { pickAccountsUser } from "@/lib/routing";
import { accountsBranchIds } from "@/lib/requests";
import type { Role } from "@/lib/types";

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

async function loadUserBasics(userId: number) {
  return queryOne<{
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
  }>(
    `SELECT u.id, u.name, u.email, u.role, u.department, u.default_branch_id,
            b.branch_name AS default_branch_name,
            u.supervisor_id, sup.name AS supervisor_name, u.is_active
       FROM users u
       LEFT JOIN branches b ON b.id = u.default_branch_id
       LEFT JOIN users sup ON sup.id = u.supervisor_id
      WHERE u.id = ?`,
    [userId]
  );
}

async function nameOf(userId: number | null): Promise<{ id: number; name: string; email: string } | null> {
  if (!userId) return null;
  const row = await queryOne<{ id: number; name: string; email: string }>(
    "SELECT id, name, email FROM users WHERE id = ?",
    [userId]
  );
  return row ?? null;
}

async function buildBranchFlow(
  user: NonNullable<Awaited<ReturnType<typeof loadUserBasics>>>,
  branchId: number,
  branchName: string
): Promise<BranchFlow> {
  const membershipRole = await getUserRoleForBranch(user.id, branchId);
  const effectiveRole = membershipRole ?? user.role;

  const approvalPath = await getApprovalPath(branchId, effectiveRole, user.id);
  const nodes: FlowNode[] = [
    {
      kind: "requester",
      label: "Requester",
      user: { id: user.id, name: user.name, email: user.email },
      note: `${effectiveRole.replace(/_/g, " ")}${membershipRole ? " (branch membership)" : ""}`,
      warning: null,
    },
  ];

  if (approvalPath === "supervisor_then_accounts") {
    const profile = await getBranchProfile(branchId);
    const resolution = await resolveRequestSupervisor(
      user.id,
      branchId,
      profile?.default_supervisor_user_id ?? null
    );
    const supUser = await nameOf(resolution.supervisorId);
    const sourceLabel: Record<string, string> = {
      personal_supervisor: "Personal supervisor (assigned in Users)",
      branch_profile_default: "Branch default supervisor",
      branch_membership: "Supervisor assigned to this branch",
      any_supervisor: "Fallback — any active supervisor",
      none: "No supervisor available",
    };
    let warning: string | null = null;
    if (resolution.personalSupervisorInvalidForBranch) {
      const personal = await nameOf(resolution.personalSupervisorId);
      warning = `${personal?.name ?? "Their personal supervisor"} is assigned as this user's personal supervisor but has no supervisor membership on ${branchName}, so their requests route elsewhere instead.`;
    }
    if (!resolution.supervisorId) {
      warning = warning
        ? `${warning} No supervisor could be resolved for this branch at all.`
        : "No supervisor could be resolved for this branch.";
    }
    nodes.push({
      kind: "supervisor",
      label: "Supervisor",
      user: supUser,
      note: sourceLabel[resolution.source] ?? null,
      warning,
    });
  }

  if (
    approvalPath === "supervisor_then_accounts" ||
    approvalPath === "direct_accounts" ||
    approvalPath === "self_approve_pending_payment"
  ) {
    const accountsUserId = await pickAccountsUser(branchId);
    const accUser = await nameOf(accountsUserId);
    nodes.push({
      kind: "accounts",
      label: "Accounts",
      user: accUser,
      note: accUser ? "Accounts handler for this branch" : null,
      warning: accUser ? null : "No accounts user is assigned to handle this branch.",
    });
  }

  if (approvalPath === "accounts_supervisor_then_pay") {
    const accSupCandidates = await query<{ id: number; name: string; email: string }>(
      `SELECT id, name, email FROM users WHERE role = 'accounts_supervisor' AND is_active = 1 ORDER BY name`
    );
    const covering: { id: number; name: string; email: string }[] = [];
    for (const u of accSupCandidates) {
      const assigned = await accountsBranchIds(u.id);
      if (assigned.length === 0 || assigned.includes(branchId)) covering.push(u);
    }
    if (covering.length === 0) {
      nodes.push({
        kind: "accounts_supervisor",
        label: "Accounts Supervisor",
        user: null,
        note: null,
        warning: "No accounts supervisor covers this branch.",
      });
    } else {
      for (const u of covering) {
        nodes.push({
          kind: "accounts_supervisor",
          label: "Accounts Supervisor",
          user: { id: u.id, name: u.name, email: u.email },
          note: "Approves and pays directly",
          warning: null,
        });
      }
    }
  }

  return {
    branch_id: branchId,
    branch_name: branchName,
    effective_role: effectiveRole,
    approval_path: approvalPath,
    approval_path_label: APPROVAL_PATH_LABELS[approvalPath],
    nodes,
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireApiSession(["admin"]);
    const userId = Number(req.nextUrl.searchParams.get("userId") || 0);
    if (!userId) throw new ApiError(400, "userId required");

    const user = await loadUserBasics(userId);
    if (!user) throw new ApiError(404, "User not found");

    const workspaceBranches = await listWorkspaceBranchesForUser(userId);
    const branchMap = new Map<number, string>();
    for (const b of workspaceBranches) branchMap.set(b.id, b.branch_name);
    if (user.default_branch_id && user.default_branch_name) {
      branchMap.set(user.default_branch_id, user.default_branch_name);
    }
    if (branchMap.size === 0) {
      const all = await query<{ id: number; branch_name: string }>(
        "SELECT id, branch_name FROM branches WHERE is_active = 1 ORDER BY branch_name"
      );
      for (const b of all) branchMap.set(b.id, b.branch_name);
    }

    const downstream: BranchFlow[] = [];
    for (const [branchId, branchName] of branchMap) {
      downstream.push(await buildBranchFlow(user, branchId, branchName));
    }
    downstream.sort((a, b) => a.branch_name.localeCompare(b.branch_name));

    // Upstream: who routes to this user, if they act as supervisor / accounts / acc-sup.
    const upstream: {
      personalSupervisees: { id: number; name: string; branch_id: number | null; branch_name: string | null; valid: boolean }[];
      supervisorBranches: { branch_id: number; branch_name: string; source: "branch_default" | "branch_membership" }[];
      accountsBranches: { branch_id: number; branch_name: string }[];
      accountsSupervisorScope: "all" | "assigned" | null;
      accountsSupervisorBranches: { branch_id: number; branch_name: string }[];
    } = {
      personalSupervisees: [],
      supervisorBranches: [],
      accountsBranches: [],
      accountsSupervisorScope: null,
      accountsSupervisorBranches: [],
    };

    const supervisees = await query<{
      id: number;
      name: string;
      default_branch_id: number | null;
      default_branch_name: string | null;
    }>(
      `SELECT u.id, u.name, u.default_branch_id, b.branch_name AS default_branch_name
         FROM users u LEFT JOIN branches b ON b.id = u.default_branch_id
        WHERE u.supervisor_id = ? AND u.is_active = 1
        ORDER BY u.name`,
      [userId]
    );
    for (const s of supervisees) {
      let valid = false;
      if (s.default_branch_id) {
        const role = await getUserRoleForBranch(userId, s.default_branch_id);
        valid = role === "supervisor";
      }
      upstream.personalSupervisees.push({
        id: s.id,
        name: s.name,
        branch_id: s.default_branch_id,
        branch_name: s.default_branch_name,
        valid,
      });
    }

    const membershipBranches = await query<{ branch_id: number; branch_name: string }>(
      `SELECT ubr.branch_id, b.branch_name
         FROM user_branch_roles ubr JOIN branches b ON b.id = ubr.branch_id
        WHERE ubr.user_id = ? AND ubr.role = 'supervisor'
        ORDER BY b.branch_name`,
      [userId]
    );
    for (const m of membershipBranches) {
      upstream.supervisorBranches.push({
        branch_id: m.branch_id,
        branch_name: m.branch_name,
        source: "branch_membership",
      });
    }
    const defaultForBranches = await query<{ branch_id: number; branch_name: string }>(
      `SELECT p.branch_id, b.branch_name
         FROM branch_profiles p JOIN branches b ON b.id = p.branch_id
        WHERE p.default_supervisor_user_id = ?
        ORDER BY b.branch_name`,
      [userId]
    );
    for (const d of defaultForBranches) {
      if (!upstream.supervisorBranches.some((x) => x.branch_id === d.branch_id)) {
        upstream.supervisorBranches.push({
          branch_id: d.branch_id,
          branch_name: d.branch_name,
          source: "branch_default",
        });
      }
    }

    if (user.role === "accounts") {
      const ids = await accountsBranchIds(userId);
      if (ids.length) {
        const rows = await query<{ id: number; branch_name: string }>(
          `SELECT id, branch_name FROM branches WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY branch_name`,
          ids
        );
        upstream.accountsBranches = rows.map((r) => ({ branch_id: r.id, branch_name: r.branch_name }));
      }
    }

    if (user.role === "accounts_supervisor") {
      const ids = await accountsBranchIds(userId);
      upstream.accountsSupervisorScope = ids.length === 0 ? "all" : "assigned";
      if (ids.length) {
        const rows = await query<{ id: number; branch_name: string }>(
          `SELECT id, branch_name FROM branches WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY branch_name`,
          ids
        );
        upstream.accountsSupervisorBranches = rows.map((r) => ({ branch_id: r.id, branch_name: r.branch_name }));
      }
    }

    return ok({ user, downstream, upstream });
  } catch (err) {
    return fail(err);
  }
}
