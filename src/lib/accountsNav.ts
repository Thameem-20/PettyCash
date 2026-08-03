import { query } from "./db";
import {
  accountsBranchIds,
  countPendingZyboVouchers,
  countPendingPcpJv,
} from "./requests";
import { branchIdsWithCodingType } from "./branchProfile";
import {
  allowAllBranchesForRole,
  resolveBranchScope,
  scopeIdsFrom,
  type AccountsBranch,
} from "./accountsBranch";
import type { AccountsNavBadges } from "./accountsNavBadges";

export type { AccountsNavBadges } from "./accountsNavBadges";

const ACCOUNTS_NAV_ROLES = new Set(["accounts", "accounts_supervisor", "admin"]);

export async function getAccountsNavBadges(session: {
  id: number;
  role: string;
  primary_role?: string;
  preferred_branch_param?: string;
}): Promise<AccountsNavBadges | null> {
  const role = session.primary_role || session.role;
  if (!ACCOUNTS_NAV_ROLES.has(role) && !ACCOUNTS_NAV_ROLES.has(session.role)) return null;

  let branchList: AccountsBranch[];
  if (session.role === "accounts" || role === "accounts") {
    const ids = await accountsBranchIds(session.id);
    branchList = ids.length
      ? await query(
          "SELECT id, branch_name, branch_code FROM branches WHERE id IN (?) ORDER BY branch_name",
          [ids]
        )
      : [];
  } else {
    branchList = await query(
      "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
    );
  }

  if (branchList.length === 0) {
    return { pendingZyboVoucher: 0, pendingPcpJv: 0 };
  }

  // Match accounts pages: badge counts follow the currently selected branch (or all).
  const allowAll = allowAllBranchesForRole(role);
  const scope = resolveBranchScope(session.preferred_branch_param, branchList, allowAll);
  const scopeIds = scopeIdsFrom(scope);

  const [zyboIds, pcpIds] = await Promise.all([
    branchIdsWithCodingType("zybo", scopeIds),
    branchIdsWithCodingType("pcp_jv", scopeIds),
  ]);

  const [pendingZyboVoucher, pendingPcpJv] = await Promise.all([
    countPendingZyboVouchers(zyboIds),
    countPendingPcpJv(pcpIds),
  ]);

  return { pendingZyboVoucher, pendingPcpJv };
}
