// Status values + state machines for the three workflows.

// ----- Exact payment / reimbursement -----
export const EXACT_STATUS = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PENDING_SUPERVISOR: "Pending Supervisor Approval",
  REJECTED: "Rejected",
  RETURNED: "Returned for Correction",
  PENDING_ACCOUNTS_REVIEW: "Pending Accounts Review",
  PENDING_ACC_SUP: "Pending Accounts Supervisor Approval",
  PENDING_PAYMENT: "Pending Payment",
  PAID: "Paid",
  AWAITING_RECEIVER: "Awaiting Receiver Confirmation",
  CLOSED: "Closed",
} as const;

/** Roles that create self-reimbursement (exact-only) with alternate pay routing. */
export const STAFF_REIMBURSEMENT_ROLES = [
  "supervisor",
  "accounts",
  "accounts_supervisor",
] as const;

export type StaffReimbursementRole = (typeof STAFF_REIMBURSEMENT_ROLES)[number];

export function isStaffReimbursementRole(role: string | null | undefined): role is StaffReimbursementRole {
  return (
    role === "supervisor" || role === "accounts" || role === "accounts_supervisor"
  );
}

// ----- Suspense / advance -----
export const SUSPENSE_STATUS = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PENDING_SUPERVISOR: "Pending Supervisor Approval",
  REJECTED: "Rejected",
  RETURNED: "Returned for Correction",
  PENDING_ACCOUNTS_ISSUE: "Pending Accounts Issue",
  SUSPENSE_ISSUED: "Suspense Issued",
  AWAITING_CASH_RECEIPT: "Awaiting Cash Receipt Confirmation",
  OPEN_SUSPENSE: "Open Suspense",
  RECEIPT_SUBMITTED: "Receipt Submitted",
  PENDING_SETTLEMENT_REVIEW: "Pending Settlement Review",
  BALANCE_RETURNED: "Balance Returned",
  ADDITIONAL_PAYABLE: "Additional Payable",
  CLOSED: "Closed",
} as const;

// ----- Top-up -----
export const TOPUP_STATUS = {
  REQUESTED: "Requested by Accounts",
  PENDING_ACC_SUP: "Pending Accounts Supervisor Approval",
  REJECTED_ACC_SUP: "Rejected by Accounts Supervisor",
  PENDING_TREASURY: "Pending Treasury Approval",
  REJECTED_TREASURY: "Rejected by Treasury",
  TREASURY_APPROVED: "Treasury Approved",
  CASH_RELEASED: "Cash Released",
  RECEIVED_BY_ACCOUNTS: "Received by Accounts",
  BRANCH_BALANCE_UPDATED: "Branch Balance Updated",
  CLOSED: "Closed",
} as const;

// Statuses an accounts user treats as "open suspense" (cash is out).
export const OPEN_SUSPENSE_STATUSES: string[] = [
  SUSPENSE_STATUS.OPEN_SUSPENSE,
  SUSPENSE_STATUS.RECEIPT_SUBMITTED,
  SUSPENSE_STATUS.PENDING_SETTLEMENT_REVIEW,
  SUSPENSE_STATUS.BALANCE_RETURNED,
  SUSPENSE_STATUS.ADDITIONAL_PAYABLE,
];

// Terminal statuses.
export const CLOSED_STATUSES: string[] = [
  EXACT_STATUS.CLOSED,
  EXACT_STATUS.REJECTED,
  SUSPENSE_STATUS.CLOSED,
  SUSPENSE_STATUS.REJECTED,
];

// Statuses waiting on accounts to pay / issue.
export const ACCOUNTS_PENDING_STATUSES: string[] = [
  EXACT_STATUS.PENDING_ACCOUNTS_REVIEW,
  EXACT_STATUS.PENDING_PAYMENT,
  SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE,
];

// Determine if a status belongs to a colour bucket for badges.
export function statusTone(status: string): "neutral" | "warn" | "good" | "bad" | "info" {
  if (CLOSED_STATUSES.includes(status)) {
    return status.startsWith("Rejected") || status === "Rejected" ? "bad" : "good";
  }
  if (status === EXACT_STATUS.PAID || status === SUSPENSE_STATUS.SUSPENSE_ISSUED) return "good";
  if (status === EXACT_STATUS.RETURNED || status === SUSPENSE_STATUS.RETURNED) return "warn";
  if (OPEN_SUSPENSE_STATUSES.includes(status)) return "info";
  return "neutral";
}
