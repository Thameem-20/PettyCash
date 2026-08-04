import { CLOSED_STATUSES, EXACT_STATUS, SUSPENSE_STATUS } from "./status";

/** Statuses where Acc Sup may still change amounts (cash not yet posted). */
export const ACC_SUP_AMOUNT_EDIT_STATUSES: string[] = [
  EXACT_STATUS.SUBMITTED,
  EXACT_STATUS.PENDING_SUPERVISOR,
  EXACT_STATUS.RETURNED,
  EXACT_STATUS.PENDING_ACCOUNTS_REVIEW,
  EXACT_STATUS.PENDING_PAYMENT,
  EXACT_STATUS.PENDING_ACC_SUP,
  SUSPENSE_STATUS.SUBMITTED,
  SUSPENSE_STATUS.PENDING_SUPERVISOR,
  SUSPENSE_STATUS.RETURNED,
  SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE,
];

export function canAccSupAmend(status: string): boolean {
  // Any non-closed / non-rejected request can be amended by Acc Sup.
  return !CLOSED_STATUSES.includes(status);
}

export function canAccSupAmendAmounts(status: string): boolean {
  return ACC_SUP_AMOUNT_EDIT_STATUSES.includes(status);
}

/**
 * Once cash has actually moved (paid_amount set), Acc Sup can still correct the
 * recorded paid amount — e.g. a mistyped amount that was actually paid/issued —
 * as long as the request isn't closed/rejected yet. This adjusts the cash ledger
 * by the difference so the system balance matches the real cash in hand.
 */
export function canAccSupCorrectPaidAmount(
  status: string,
  paidAmount: number | string | null | undefined
): boolean {
  return !CLOSED_STATUSES.includes(status) && paidAmount != null;
}
