import type { EnrichedRequest } from "@/lib/requests";
import type { SessionUser } from "@/lib/types";
import { ACCOUNTS_PENDING_STATUSES, EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";

export function accountsCanSeeBranchBalance(
  session: SessionUser,
  request: EnrichedRequest,
  accountsBranchIds: number[]
): boolean {
  if (!["accounts", "accounts_supervisor", "admin"].includes(session.role)) return false;
  if (session.role === "accounts" && !accountsBranchIds.includes(request.branch_id)) return false;
  return true;
}

export function shouldShowAccountsBalanceBar(
  session: SessionUser,
  request: EnrichedRequest,
  accountsBranchIds: number[]
): boolean {
  if (!accountsCanSeeBranchBalance(session, request, accountsBranchIds)) return false;

  const s = request.status;
  if (ACCOUNTS_PENDING_STATUSES.includes(s)) return true;

  if (
    request.request_type === "suspense" &&
    (s === SUSPENSE_STATUS.RECEIPT_SUBMITTED || s === SUSPENSE_STATUS.PENDING_SETTLEMENT_REVIEW)
  ) {
    return true;
  }

  if (
    request.request_type === "exact" &&
    (s === EXACT_STATUS.PENDING_PAYMENT || s === EXACT_STATUS.PENDING_ACCOUNTS_REVIEW) &&
    request.processing_by_user_id
  ) {
    return true;
  }

  if (request.request_type === "suspense" && s === SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE && request.processing_by_user_id) {
    return true;
  }

  return false;
}
