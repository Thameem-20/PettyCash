import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { accountsCanHandle } from "@/lib/requests";
import { removeRequestPaymentLedger } from "@/lib/ledger";
import { auditTx } from "@/lib/audit";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";
import { money, round2 } from "@/lib/util";

/**
 * Accounts Supervisor fallback: undo the most recent pay / issue-advance step.
 * Removes the original ledger payment row (does not post a reversing adjustment),
 * restores cash in hand, and puts the request back in the accounts queue.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason || "").trim();
    if (!reason) throw new ApiError(400, "A reason is required to undo a payment.");

    const request = await queryOne<PettyCashRequest>(
      "SELECT * FROM petty_cash_requests WHERE id = ?",
      [id]
    );
    if (!request) throw new ApiError(404, "Request not found");
    if (!(await accountsCanHandle(session, request.branch_id))) {
      throw new ApiError(403, "Not your branch");
    }

    const paidAmount = round2(Number(request.paid_amount || 0));
    const hasLivePayment = paidAmount > 0 && !!request.paid_at;

    let restoreStatus: string;
    let undoLabel: string;
    let ledgerType: "exact_paid" | "suspense_issued";

    if (request.request_type === "exact") {
      ledgerType = "exact_paid";
      const awaiting = request.status === EXACT_STATUS.AWAITING_RECEIVER;
      const queueAfterUndo =
        request.status === EXACT_STATUS.PENDING_PAYMENT ||
        request.status === EXACT_STATUS.PENDING_ACC_SUP;
      if (!awaiting && !(queueAfterUndo && !hasLivePayment)) {
        throw new ApiError(
          409,
          "Undo payment is only available while awaiting receiver confirmation, or to clear a leftover ledger row after a prior undo."
        );
      }
      restoreStatus =
        request.submitter_role === "accounts"
          ? EXACT_STATUS.PENDING_ACC_SUP
          : EXACT_STATUS.PENDING_PAYMENT;
      undoLabel = "payment";
    } else if (request.request_type === "suspense") {
      ledgerType = "suspense_issued";
      const awaiting = request.status === SUSPENSE_STATUS.AWAITING_CASH_RECEIPT;
      const queueAfterUndo = request.status === SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE;
      if (!awaiting && !(queueAfterUndo && !hasLivePayment)) {
        throw new ApiError(
          409,
          "Undo advance is only available while awaiting cash receipt confirmation, or to clear a leftover ledger row after a prior undo."
        );
      }
      restoreStatus = SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE;
      undoLabel = "advance issue";
    } else {
      throw new ApiError(400, "Unsupported request type.");
    }

    await withTransaction(async (conn) => {
      const removed = await removeRequestPaymentLedger(conn, {
        branchId: request.branch_id,
        requestId: id,
        transactionType: ledgerType,
      });

      if (removed.removedIds.length === 0 && !hasLivePayment) {
        throw new ApiError(409, "No payment ledger entry found to remove for this request.");
      }

      const credited = removed.removedDebit || paidAmount;

      await conn.execute(
        `UPDATE petty_cash_requests
            SET status = ?,
                paid_amount = NULL,
                paid_at = NULL,
                processing_by_user_id = NULL
          WHERE id = ?`,
        [restoreStatus, id]
      );

      await conn.execute(
        `INSERT INTO approvals
           (request_id, approver_user_id, approval_level, action, comments, old_amount, new_amount)
         VALUES (?,?,?,?,?,?,?)`,
        [
          id,
          session.id,
          "accounts_supervisor",
          "undo_payment",
          `Undid ${undoLabel} · removed ledger payment · ${reason}`,
          credited || paidAmount || null,
          null,
        ]
      );

      await auditTx(conn, {
        userId: session.id,
        action: "undo_payment",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: {
          status: request.status,
          paid_amount: request.paid_amount,
          paid_at: request.paid_at,
        },
        newValue: {
          status: restoreStatus,
          paid_amount: null,
          reason,
          removed_ledger_ids: removed.removedIds,
          credited: money(credited),
        },
      });
    });

    return ok({ restored_status: restoreStatus });
  } catch (err) {
    return fail(err);
  }
}
