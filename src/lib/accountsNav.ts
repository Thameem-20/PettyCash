import { query } from "./db";
import {
  accountsBranchIds,
  countPendingZyboVouchers,
  countPendingPcpJv,
} from "./requests";
import { branchIdsWithCodingType } from "./branchProfile";
import type { AccountsNavBadges } from "./accountsNavBadges";

export type { AccountsNavBadges } from "./accountsNavBadges";

const ACCOUNTS_NAV_ROLES = new Set(["accounts", "accounts_supervisor", "admin"]);

export async function getAccountsNavBadges(session: {
  id: number;
  role: string;
  primary_role?: string;
}): Promise<AccountsNavBadges | null> {
  const role = session.primary_role || session.role;
  if (!ACCOUNTS_NAV_ROLES.has(role) && !ACCOUNTS_NAV_ROLES.has(session.role)) return null;

  let branchIds: number[];
  if (session.role === "accounts" || role === "accounts") {
    branchIds = await accountsBranchIds(session.id);
  } else {
    const rows = await query<{ id: number }>("SELECT id FROM branches WHERE is_active = 1");
    branchIds = rows.map((r) => r.id);
  }

  const [zyboIds, pcpIds] = await Promise.all([
    branchIdsWithCodingType("zybo", branchIds),
    branchIdsWithCodingType("pcp_jv", branchIds),
  ]);

  const [pendingZyboVoucher, pendingPcpJv] = await Promise.all([
    countPendingZyboVouchers(zyboIds),
    countPendingPcpJv(pcpIds),
  ]);

  return { pendingZyboVoucher, pendingPcpJv };
}
