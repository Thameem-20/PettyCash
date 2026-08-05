import { query, queryOne } from "./db";
import { CLOSED_STATUSES, EXACT_STATUS, OPEN_SUSPENSE_STATUSES, SUSPENSE_STATUS } from "./status";

export type FieldStaffNavBadges = {
  confirmPending: number;
  openSuspense: number;
  opsAssigned: number;
  pendingApprovals: number;
};

export async function getFieldStaffNavBadges(
  userId: number,
  opts?: { branchIds?: number[] }
): Promise<FieldStaffNavBadges> {
  const closedPh = CLOSED_STATUSES.map(() => "?").join(",");
  const branchIds = opts?.branchIds;
  const branchFilter =
    branchIds && branchIds.length > 0
      ? ` AND branch_id IN (${branchIds.map(() => "?").join(",")})`
      : "";
  const branchParams = branchIds && branchIds.length > 0 ? [...branchIds] : [];

  const [confirmRow, suspenseRow, opsRow, approvalsRow] = await Promise.all([
    queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM petty_cash_requests
        WHERE cash_receiver_user_id = ? AND status IN (?, ?)`,
      [userId, EXACT_STATUS.AWAITING_RECEIVER, SUSPENSE_STATUS.AWAITING_CASH_RECEIPT]
    ),
    queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM petty_cash_requests
        WHERE (submitted_by_user_id = ? OR cash_receiver_user_id = ?)
          AND status IN (${OPEN_SUSPENSE_STATUSES.map(() => "?").join(",")})`,
      [userId, userId, ...OPEN_SUSPENSE_STATUSES]
    ),
    queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM petty_cash_requests r
         JOIN users su ON su.id = r.submitted_by_user_id
        WHERE r.cash_receiver_user_id = ?
          AND (r.submitter_role = 'operations' OR su.role = 'operations')
          AND r.status NOT IN (${closedPh})`,
      [userId, ...CLOSED_STATUSES]
    ),
    queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM petty_cash_requests
        WHERE supervisor_id = ?
          AND status IN (?, ?)
          ${branchFilter}`,
      [
        userId,
        EXACT_STATUS.PENDING_SUPERVISOR,
        SUSPENSE_STATUS.PENDING_SUPERVISOR,
        ...branchParams,
      ]
    ),
  ]);

  return {
    confirmPending: Number(confirmRow?.c || 0),
    openSuspense: Number(suspenseRow?.c || 0),
    opsAssigned: Number(opsRow?.c || 0),
    pendingApprovals: Number(approvalsRow?.c || 0),
  };
}

/** Pending supervisor approvals grouped by branch (for workspace switcher badges). */
export async function getSupervisorPendingApprovalsByBranch(
  userId: number,
  branchIds: number[]
): Promise<Record<number, number>> {
  if (branchIds.length === 0) return {};
  const ph = branchIds.map(() => "?").join(",");
  const rows = await query<{ branch_id: number; c: number }>(
    `SELECT branch_id, COUNT(*) AS c
       FROM petty_cash_requests
      WHERE supervisor_id = ?
        AND status IN (?, ?)
        AND branch_id IN (${ph})
      GROUP BY branch_id`,
    [userId, EXACT_STATUS.PENDING_SUPERVISOR, SUSPENSE_STATUS.PENDING_SUPERVISOR, ...branchIds]
  );
  const map: Record<number, number> = {};
  for (const row of rows) map[Number(row.branch_id)] = Number(row.c);
  return map;
}
