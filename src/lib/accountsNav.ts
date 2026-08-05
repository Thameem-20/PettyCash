import {
  countPendingZyboVouchers,
  countPendingPcpJv,
  countRequestsWhere,
} from "./requests";
import { branchIdsWithCodingType } from "./branchProfile";
import {
  allowAllBranchesForRole,
  resolveBranchScope,
  scopeIdsFrom,
} from "./accountsBranch";
import { getBranchListForSession } from "./accountsBranchServer";
import { EXACT_STATUS, SUSPENSE_STATUS } from "./status";
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

  const branchList = await getBranchListForSession(session);

  if (branchList.length === 0) {
    return { pendingZyboVoucher: 0, pendingPcpJv: 0, pendingSupervisorCover: 0 };
  }

  // Match accounts pages: badge counts follow the currently selected branch (or all).
  const allowAll = allowAllBranchesForRole(role);
  const scope = resolveBranchScope(session.preferred_branch_param, branchList, allowAll);
  const scopeIds = scopeIdsFrom(scope);

  const [zyboIds, pcpIds] = await Promise.all([
    branchIdsWithCodingType("zybo", scopeIds),
    branchIdsWithCodingType("pcp_jv", scopeIds),
  ]);

  const isAccSupNav =
    role === "accounts_supervisor" ||
    role === "admin" ||
    session.role === "accounts_supervisor" ||
    session.role === "admin";

  const pendingStatuses = [EXACT_STATUS.PENDING_SUPERVISOR, SUSPENSE_STATUS.PENDING_SUPERVISOR];
  const coverPh = pendingStatuses.map(() => "?").join(",");
  const coverWhere = `r.branch_id IN (${scopeIds.map(() => "?").join(",")}) AND r.status IN (${coverPh})`;

  const [pendingZyboVoucher, pendingPcpJv, pendingSupervisorCover] = await Promise.all([
    countPendingZyboVouchers(zyboIds),
    countPendingPcpJv(pcpIds),
    isAccSupNav
      ? countRequestsWhere(coverWhere, [...scopeIds, ...pendingStatuses])
      : Promise.resolve(0),
  ]);

  return { pendingZyboVoucher, pendingPcpJv, pendingSupervisorCover };
}
