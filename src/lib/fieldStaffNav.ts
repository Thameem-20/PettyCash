import { queryOne } from "./db";
import { CLOSED_STATUSES, EXACT_STATUS, OPEN_SUSPENSE_STATUSES, SUSPENSE_STATUS } from "./status";

export type FieldStaffNavBadges = {
  confirmPending: number;
  openSuspense: number;
  opsAssigned: number;
  pendingApprovals: number;
};

export async function getFieldStaffNavBadges(userId: number): Promise<FieldStaffNavBadges> {
  const closedPh = CLOSED_STATUSES.map(() => "?").join(",");

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
        WHERE (supervisor_id = ? OR supervisor_id IS NULL)
          AND status IN (?, ?)`,
      [userId, EXACT_STATUS.PENDING_SUPERVISOR, SUSPENSE_STATUS.PENDING_SUPERVISOR]
    ),
  ]);

  return {
    confirmPending: Number(confirmRow?.c || 0),
    openSuspense: Number(suspenseRow?.c || 0),
    opsAssigned: Number(opsRow?.c || 0),
    pendingApprovals: Number(approvalsRow?.c || 0),
  };
}
