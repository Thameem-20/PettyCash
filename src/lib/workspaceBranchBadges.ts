import { query } from "./db";
import {
  ACCOUNTS_PENDING_STATUSES,
  EXACT_STATUS,
  SUSPENSE_STATUS,
} from "./status";

export type WorkspaceBranchBadge = {
  pendingApprovals?: number;
  pendingPayments?: number;
};

function emptyMaps(branchIds: number[]) {
  const approvals: Record<number, number> = {};
  const payments: Record<number, number> = {};
  for (const id of branchIds) {
    approvals[id] = 0;
    payments[id] = 0;
  }
  return { approvals, payments };
}

function toBadgeMap(
  branchIds: number[],
  approvals: Record<number, number>,
  payments: Record<number, number>,
  opts: { showApprovals: boolean; showPayments: boolean }
): Record<number, WorkspaceBranchBadge> {
  const out: Record<number, WorkspaceBranchBadge> = {};
  for (const id of branchIds) {
    const badge: WorkspaceBranchBadge = {};
    if (opts.showApprovals) {
      const n = approvals[id] || 0;
      if (n > 0) badge.pendingApprovals = n;
    }
    if (opts.showPayments) {
      const n = payments[id] || 0;
      if (n > 0) badge.pendingPayments = n;
    }
    if (badge.pendingApprovals || badge.pendingPayments) out[id] = badge;
  }
  return out;
}

async function countPaymentsByBranch(branchIds: number[]): Promise<Record<number, number>> {
  const { approvals, payments } = emptyMaps(branchIds);
  if (branchIds.length === 0) return payments;
  const phBranch = branchIds.map(() => "?").join(",");
  const phStatus = ACCOUNTS_PENDING_STATUSES.map(() => "?").join(",");
  const rows = await query<{ branch_id: number; c: number }>(
    `SELECT branch_id, COUNT(*) AS c
       FROM petty_cash_requests
      WHERE branch_id IN (${phBranch})
        AND status IN (${phStatus})
      GROUP BY branch_id`,
    [...branchIds, ...ACCOUNTS_PENDING_STATUSES]
  );
  for (const row of rows) payments[Number(row.branch_id)] = Number(row.c);
  return payments;
}

async function countAccSupApprovalsByBranch(
  branchIds: number[]
): Promise<Record<number, number>> {
  const { approvals } = emptyMaps(branchIds);
  if (branchIds.length === 0) return approvals;
  // Acc Sup "pending approvals" = escalated Acc Sup queue + supervisor-cover queue.
  const approvalStatuses = [
    EXACT_STATUS.PENDING_ACC_SUP,
    EXACT_STATUS.PENDING_SUPERVISOR,
    SUSPENSE_STATUS.PENDING_SUPERVISOR,
  ];
  const uniqueStatuses = [...new Set(approvalStatuses)];
  const phBranch = branchIds.map(() => "?").join(",");
  const phStatus = uniqueStatuses.map(() => "?").join(",");
  const rows = await query<{ branch_id: number; c: number }>(
    `SELECT branch_id, COUNT(*) AS c
       FROM petty_cash_requests
      WHERE branch_id IN (${phBranch})
        AND status IN (${phStatus})
      GROUP BY branch_id`,
    [...branchIds, ...uniqueStatuses]
  );
  for (const row of rows) approvals[Number(row.branch_id)] = Number(row.c);
  return approvals;
}

async function countSupervisorApprovalsByBranch(
  userId: number,
  branchIds: number[]
): Promise<Record<number, number>> {
  const { approvals } = emptyMaps(branchIds);
  if (branchIds.length === 0) return approvals;
  const phBranch = branchIds.map(() => "?").join(",");
  const rows = await query<{ branch_id: number; c: number }>(
    `SELECT branch_id, COUNT(*) AS c
       FROM petty_cash_requests
      WHERE supervisor_id = ?
        AND status IN (?, ?)
        AND branch_id IN (${phBranch})
      GROUP BY branch_id`,
    [userId, EXACT_STATUS.PENDING_SUPERVISOR, SUSPENSE_STATUS.PENDING_SUPERVISOR, ...branchIds]
  );
  for (const row of rows) approvals[Number(row.branch_id)] = Number(row.c);
  return approvals;
}

/** Per-branch queue badges for the workspace branch switcher. */
export async function getWorkspaceBranchBadges(
  session: { id: number; role: string; primary_role?: string },
  branchIds: number[]
): Promise<Record<number, WorkspaceBranchBadge>> {
  if (branchIds.length === 0) return {};

  const role = session.primary_role || session.role;
  const isSupervisor = session.role === "supervisor" || role === "supervisor";
  const isAccounts = session.role === "accounts" || role === "accounts";
  const isAccSup =
    session.role === "accounts_supervisor" ||
    role === "accounts_supervisor" ||
    session.role === "admin" ||
    role === "admin";

  if (isSupervisor && !isAccSup && !isAccounts) {
    const approvals = await countSupervisorApprovalsByBranch(session.id, branchIds);
    return toBadgeMap(branchIds, approvals, {}, { showApprovals: true, showPayments: false });
  }

  if (isAccounts && !isAccSup) {
    const payments = await countPaymentsByBranch(branchIds);
    return toBadgeMap(branchIds, {}, payments, { showApprovals: false, showPayments: true });
  }

  if (isAccSup) {
    const [approvals, payments] = await Promise.all([
      countAccSupApprovalsByBranch(branchIds),
      countPaymentsByBranch(branchIds),
    ]);
    return toBadgeMap(branchIds, approvals, payments, {
      showApprovals: true,
      showPayments: true,
    });
  }

  return {};
}
