import { query } from "./db";
import { accountsBranchIds } from "./requests";
import { listWorkspaceBranchesForUser } from "./branchMembership";
import type { AccountsBranch } from "./accountsBranch";

/** Branches visible in accounts-style pages for the current session. */
export async function getBranchListForSession(session: {
  id: number;
  role: string;
  primary_role?: string;
}): Promise<AccountsBranch[]> {
  const role = session.role;
  const primary = session.primary_role || role;

  if (role === "accounts" || (role !== "admin" && role !== "accounts_supervisor" && primary === "accounts")) {
    const ids = await accountsBranchIds(session.id);
    // Also include any workspace memberships (e.g. multi-role users).
    const workspace = await listWorkspaceBranchesForUser(session.id);
    const merged = [...new Set([...ids, ...workspace.map((b) => b.id)])];
    return merged.length
      ? query(
          "SELECT id, branch_name, branch_code FROM branches WHERE id IN (?) ORDER BY branch_name",
          [merged]
        )
      : [];
  }

  if (primary === "accounts_supervisor" || role === "accounts_supervisor") {
    const ids = await accountsBranchIds(session.id);
    if (ids.length > 0) {
      return query(
        "SELECT id, branch_name, branch_code FROM branches WHERE id IN (?) AND is_active = 1 ORDER BY branch_name",
        [ids]
      );
    }
    return query(
      "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
    );
  }

  if (primary === "admin" || role === "admin") {
    return query(
      "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
    );
  }

  // Supervisor / messenger / etc. with Control Panel memberships.
  const workspace = await listWorkspaceBranchesForUser(session.id);
  if (workspace.length) {
    return workspace.map((b) => ({
      id: b.id,
      branch_name: b.branch_name,
      branch_code: b.branch_code,
    }));
  }

  return query(
    "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
  );
}
