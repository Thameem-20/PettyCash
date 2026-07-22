import { execute, queryOne } from "./db";

/** Validate branch value: "all" or a numeric id string. */
export function normalizeBranchParam(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value === "all") return "all";
  if (/^\d+$/.test(value)) return value;
  return undefined;
}

export type UserBranchPreference = {
  preferred_branch_id: number | null;
  prefer_all_branches: number | boolean;
  default_branch_id: number | null;
};

/** Preferred workspace branch from DB fields (Settings), falling back to default_branch_id. */
export function preferredParamFromUser(
  user: UserBranchPreference | null | undefined
): string | undefined {
  if (!user) return undefined;
  if (user.prefer_all_branches) return "all";
  if (user.preferred_branch_id != null) return String(user.preferred_branch_id);
  if (user.default_branch_id != null) return String(user.default_branch_id);
  return undefined;
}

export async function loadUserBranchPreference(
  userId: number
): Promise<UserBranchPreference | null> {
  return queryOne<UserBranchPreference>(
    `SELECT preferred_branch_id, prefer_all_branches, default_branch_id
       FROM users WHERE id = ? AND is_active = 1`,
    [userId]
  );
}

export async function getPreferredBranchParamForUser(
  userId: number
): Promise<string | undefined> {
  const row = await loadUserBranchPreference(userId);
  return preferredParamFromUser(row);
}

/**
 * Active branch for filtering pages.
 * DB preference wins; URL ?branch= is a fallback for old links / exports.
 */
export function resolveActiveBranchParam(
  preferredFromDb: string | null | undefined,
  urlParam?: string | null
): string | undefined {
  return normalizeBranchParam(preferredFromDb ?? undefined) ?? normalizeBranchParam(urlParam);
}

export async function setUserBranchPreference(
  userId: number,
  branch: "all" | number
): Promise<void> {
  if (branch === "all") {
    await execute(
      `UPDATE users SET prefer_all_branches = 1, preferred_branch_id = NULL WHERE id = ?`,
      [userId]
    );
    return;
  }
  await execute(
    `UPDATE users SET prefer_all_branches = 0, preferred_branch_id = ? WHERE id = ?`,
    [branch, userId]
  );
}
