import type { PoolConnection } from "mysql2/promise";
import { execute, query } from "./db";
import { getBranchProfile } from "./branchProfile";
import { resolveRequestSupervisor } from "./branchMembership";
import { EXACT_STATUS, SUSPENSE_STATUS } from "./status";
import {
  isRoleSupervisorReceiver,
  ROLE_SUPERVISOR_RECEIVER_LABEL,
} from "./supervisorCashReceiverShared";

export {
  ROLE_SUPERVISOR_RECEIVER_LABEL,
  isRoleSupervisorReceiver,
  formatCashReceiverDisplay,
} from "./supervisorCashReceiverShared";

/**
 * Resolve who should confirm cash when the request uses role-based supervisor receiver.
 * Same priority as approval routing: personal supervisor → branch default → membership.
 */
export async function resolveSupervisorCashReceiverUserId(
  submitterUserId: number,
  branchId: number
): Promise<number | null> {
  const profile = await getBranchProfile(branchId);
  const { supervisorId } = await resolveRequestSupervisor(
    submitterUserId,
    branchId,
    profile?.default_supervisor_user_id ?? null
  );
  return supervisorId;
}

type RoleReceiverRequest = {
  id: number;
  submitted_by_user_id: number;
  branch_id: number;
  cash_receiver_label: string | null;
  cash_receiver_user_id: number | null;
};

/** Re-point cash_receiver_user_id at the current supervisor for role-based receivers. */
export async function syncRoleSupervisorCashReceiver(
  conn: PoolConnection,
  request: RoleReceiverRequest
): Promise<number | null> {
  if (!isRoleSupervisorReceiver(request.cash_receiver_label)) {
    return request.cash_receiver_user_id;
  }
  const supervisorId = await resolveSupervisorCashReceiverUserId(
    request.submitted_by_user_id,
    request.branch_id
  );
  if (supervisorId == null) return request.cash_receiver_user_id;
  if (supervisorId !== request.cash_receiver_user_id) {
    await conn.execute(
      `UPDATE petty_cash_requests SET cash_receiver_user_id = ? WHERE id = ?`,
      [supervisorId, request.id]
    );
  }
  return supervisorId;
}

/** Same sync outside a transaction (detail / confirm list pages). */
export async function syncRoleSupervisorCashReceiverStandalone(
  request: RoleReceiverRequest
): Promise<number | null> {
  if (!isRoleSupervisorReceiver(request.cash_receiver_label)) {
    return request.cash_receiver_user_id;
  }
  const supervisorId = await resolveSupervisorCashReceiverUserId(
    request.submitted_by_user_id,
    request.branch_id
  );
  if (supervisorId == null) return request.cash_receiver_user_id;
  if (supervisorId !== request.cash_receiver_user_id) {
    await execute(`UPDATE petty_cash_requests SET cash_receiver_user_id = ? WHERE id = ?`, [
      supervisorId,
      request.id,
    ]);
  }
  return supervisorId;
}

/** Keep role-based supervisor receivers current while awaiting confirmation. */
export async function syncAwaitingRoleSupervisorReceivers(): Promise<void> {
  const rows = await query<RoleReceiverRequest>(
    `SELECT id, submitted_by_user_id, branch_id, cash_receiver_label, cash_receiver_user_id
       FROM petty_cash_requests
      WHERE cash_receiver_label = ?
        AND status IN (?, ?)`,
    [
      ROLE_SUPERVISOR_RECEIVER_LABEL,
      EXACT_STATUS.AWAITING_RECEIVER,
      SUSPENSE_STATUS.AWAITING_CASH_RECEIPT,
    ]
  );
  for (const row of rows) {
    await syncRoleSupervisorCashReceiverStandalone(row);
  }
}
