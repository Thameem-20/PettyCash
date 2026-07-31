import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { accountsCanHandle } from "@/lib/requests";
import { auditTx } from "@/lib/audit";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";

/**
 * Accounts Supervisor approves an escalated request for Accounts to pay/issue.
 * Does not pay — returns the request to the accounts payment/issue queue.
 * (Accounts-submitter staff reimbursements still use approve & pay via /pay.)
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const body = await req.json().catch(() => ({}));
    const comments = body.comments != null ? String(body.comments).trim() : "";

    const request = await queryOne<PettyCashRequest>(
      "SELECT * FROM petty_cash_requests WHERE id = ?",
      [id]
    );
    if (!request) throw new ApiError(404, "Request not found");
    if (!(await accountsCanHandle(session, request.branch_id))) {
      throw new ApiError(403, "Not your branch");
    }

    if (request.status !== EXACT_STATUS.PENDING_ACC_SUP) {
      throw new ApiError(409, "Request is not awaiting Accounts Supervisor approval.");
    }

    if (request.submitter_role === "accounts" && request.request_type === "exact") {
      throw new ApiError(
        409,
        "Accounts reimbursements use Approve & Pay, not approve-for-payment."
      );
    }

    if (request.submitted_by_user_id === session.id) {
      throw new ApiError(403, "You cannot approve your own request.");
    }

    const nextStatus =
      request.request_type === "suspense"
        ? SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE
        : EXACT_STATUS.PENDING_PAYMENT;

    await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE petty_cash_requests
            SET status = ?, processing_by_user_id = NULL,
                approved_amount = COALESCE(approved_amount, requested_amount),
                approved_at = COALESCE(approved_at, NOW())
          WHERE id = ?`,
        [nextStatus, id]
      );

      await conn.execute(
        `INSERT INTO approvals (request_id, approver_user_id, approval_level, action, comments)
         VALUES (?,?,?,?,?)`,
        [
          id,
          session.id,
          "accounts_supervisor",
          "approve_for_payment",
          comments || "Approved — Accounts may proceed with payment",
        ]
      );

      await auditTx(conn, {
        userId: session.id,
        action: "accounts_supervisor_approve_for_payment",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: { status: request.status },
        newValue: { status: nextStatus },
      });
    });

    return ok({ status: nextStatus });
  } catch (err) {
    return fail(err);
  }
}
