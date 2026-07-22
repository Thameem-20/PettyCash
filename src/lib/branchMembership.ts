import { execute, query, queryOne } from "./db";
import type { Role } from "./types";
import { normalizeBranchParam } from "./preferredBranch";

export interface UserBranchRole {
  id: number;
  user_id: number;
  branch_id: number;
  role: Role;
  branch_name?: string;
  branch_code?: string;
}

export async function listUserBranchRoles(userId?: number): Promise<UserBranchRole[]> {
  if (userId != null) {
    return query<UserBranchRole>(
      `SELECT ubr.*, b.branch_name, b.branch_code
         FROM user_branch_roles ubr
         JOIN branches b ON b.id = ubr.branch_id
        WHERE ubr.user_id = ?
        ORDER BY b.branch_name`,
      [userId]
    );
  }
  return query<UserBranchRole>(
    `SELECT ubr.*, b.branch_name, b.branch_code
       FROM user_branch_roles ubr
       JOIN branches b ON b.id = ubr.branch_id
      ORDER BY ubr.user_id, b.branch_name`
  );
}

export async function getUserRoleForBranch(
  userId: number,
  branchId: number
): Promise<Role | null> {
  const row = await queryOne<{ role: Role }>(
    `SELECT role FROM user_branch_roles WHERE user_id = ? AND branch_id = ?`,
    [userId, branchId]
  );
  return row?.role ?? null;
}

/**
 * Effective role for the active workspace branch.
 * Prefer membership for that branch; else fall back to primary role.
 * Admin / accounts_supervisor keep elevated primary role for page access
 * unless they have an explicit membership on the active branch (then use it
 * when acting as submitter — callers that need submitter role should use
 * resolveRoleForBranch).
 */
export async function resolveEffectiveRole(
  userId: number,
  activeBranchParam: string | null | undefined,
  fallbackRole: Role
): Promise<{ role: Role; active_branch_id: number | null }> {
  const normalized = normalizeBranchParam(activeBranchParam ?? undefined);
  if (!normalized || normalized === "all") {
    return { role: fallbackRole, active_branch_id: null };
  }
  const branchId = Number(normalized);
  if (!Number.isFinite(branchId) || branchId <= 0) {
    return { role: fallbackRole, active_branch_id: null };
  }

  const membershipRole = await getUserRoleForBranch(userId, branchId);
  if (membershipRole) {
    return { role: membershipRole, active_branch_id: branchId };
  }

  // Elevated roles keep global access without a membership row.
  if (fallbackRole === "admin" || fallbackRole === "accounts_supervisor") {
    return { role: fallbackRole, active_branch_id: branchId };
  }

  return { role: fallbackRole, active_branch_id: branchId };
}

/** Role used when creating/acting on a request for a specific branch. */
export async function resolveRoleForBranch(
  userId: number,
  branchId: number,
  fallbackRole: Role
): Promise<Role> {
  const membershipRole = await getUserRoleForBranch(userId, branchId);
  return membershipRole ?? fallbackRole;
}

export async function setUserBranchRoles(
  userId: number,
  memberships: { branch_id: number; role: Role }[]
): Promise<void> {
  await execute("DELETE FROM user_branch_roles WHERE user_id = ?", [userId]);
  for (const m of memberships) {
    if (!m.branch_id || !m.role) continue;
    await execute(
      `INSERT INTO user_branch_roles (user_id, branch_id, role) VALUES (?, ?, ?)`,
      [userId, m.branch_id, m.role]
    );
  }
  await syncAccountsAccessFromMemberships(userId, memberships);
}

/** First supervisor membership on a branch (for default routing). */
export async function findBranchSupervisorUserId(branchId: number): Promise<number | null> {
  const row = await queryOne<{ user_id: number }>(
    `SELECT user_id FROM user_branch_roles
      WHERE branch_id = ? AND role = 'supervisor'
      ORDER BY user_id ASC LIMIT 1`,
    [branchId]
  );
  return row?.user_id ?? null;
}

export type WorkspaceBranch = {
  id: number;
  branch_name: string;
  branch_code: string;
  membership_role: Role | null;
};

/**
 * Branches a user can select in Settings / work in.
 * Uses Control Panel memberships (user_branch_roles), default branch, and —
 * for accounts / accounts_supervisor users only — legacy user_branch_access rows.
 * Supervisor (and other) users are not given workspace branches from orphan access rows.
 */
export async function listWorkspaceBranchesForUser(userId: number): Promise<WorkspaceBranch[]> {
  const rows = await query<WorkspaceBranch>(
    `SELECT b.id, b.branch_name, b.branch_code,
            MAX(ubr.role) AS membership_role
       FROM branches b
       LEFT JOIN user_branch_roles ubr
         ON ubr.branch_id = b.id AND ubr.user_id = ?
       LEFT JOIN user_branch_access uba
         ON uba.branch_id = b.id AND uba.user_id = ?
       LEFT JOIN users u ON u.id = ?
      WHERE b.is_active = 1
        AND (
          ubr.id IS NOT NULL
          OR u.default_branch_id = b.id
          OR (
            uba.id IS NOT NULL
            AND u.role IN ('accounts', 'accounts_supervisor')
          )
        )
      GROUP BY b.id, b.branch_name, b.branch_code
      ORDER BY b.branch_name`,
    [userId, userId, userId]
  );
  return rows;
}

/** Keep user_branch_access in sync with Control Panel memberships. */
export async function syncAccountsAccessFromMemberships(
  userId: number,
  memberships: { branch_id: number; role: Role }[]
): Promise<void> {
  for (const m of memberships) {
    if (m.role === "accounts" || m.role === "accounts_supervisor") {
      await execute(
        `INSERT IGNORE INTO user_branch_access (user_id, branch_id, access_type)
         VALUES (?, ?, 'handler')`,
        [userId, m.branch_id]
      );
    } else {
      await execute(
        "DELETE FROM user_branch_access WHERE user_id = ? AND branch_id = ?",
        [userId, m.branch_id]
      );
    }
  }
}
