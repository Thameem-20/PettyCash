import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { accountsCanHandle } from "@/lib/requests";
import { postLedger } from "@/lib/ledger";
import { auditTx } from "@/lib/audit";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";
import { money, round2 } from "@/lib/util";

/**
 * Accounts Supervisor fallback: undo the most recent pay / issue-advance step.
 * Only while still awaiting receiver confirmation (one step after payment).
 * Credits the paid amount back to branch cash and restores the pre-payment queue status.
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
    if (!(paidAmount > 0) || !request.paid_at) {
      throw new ApiError(409, "This request has no payment to undo.");
    }

    let restoreStatus: string;
    let undoLabel: string;

    if (request.request_type === "exact") {
      if (request.status !== EXACT_STATUS.AWAITING_RECEIVER) {
        throw new ApiError(
          409,
          "Undo payment is only available while awaiting receiver confirmation (before they confirm cash)."
        );
      }
      // Accounts self-reimbursements are paid from the Acc Sup queue.
      restoreStatus =
        request.submitter_role === "accounts"
          ? EXACT_STATUS.PENDING_ACC_SUP
          : EXACT_STATUS.PENDING_PAYMENT;
      undoLabel = "payment";
    } else if (request.request_type === "suspense") {
      if (request.status !== SUSPENSE_STATUS.AWAITING_CASH_RECEIPT) {
        throw new ApiError(
          409,
          "Undo advance is only available while awaiting cash receipt confirmation (before they confirm cash)."
        );
      }
      restoreStatus = SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE;
      undoLabel = "advance issue";
    } else {
      throw new ApiError(400, "Unsupported request type.");
    }

    await withTransaction(async (conn) => {
      await postLedger(conn, {
        branchId: request.branch_id,
        transactionType: "adjustment",
        credit: paidAmount,
        requestId: id,
        createdByUserId: session.id,
        remarks: `Undo ${undoLabel} for ${request.request_no}: ${money(paidAmount)} returned to cash — ${reason}`,
      });

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
          `Undid ${undoLabel} · ${reason}`,
          paidAmount,
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
        },
      });
    });

    return ok({ restored_status: restoreStatus, credited: paidAmount });
  } catch (err) {
    return fail(err);
  }
}
