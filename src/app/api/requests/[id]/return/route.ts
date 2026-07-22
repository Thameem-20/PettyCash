import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { accountsCanHandle } from "@/lib/requests";
import { auditTx } from "@/lib/audit";
import { EXACT_STATUS, SUSPENSE_STATUS, ACCOUNTS_PENDING_STATUSES } from "@/lib/status";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts", "accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const { comments } = await req.json();

    if (!String(comments || "").trim()) {
      throw new ApiError(400, "A reason is mandatory to return for correction.");
    }

    const request = await queryOne<PettyCashRequest>("SELECT * FROM petty_cash_requests WHERE id = ?", [id]);
    if (!request) throw new ApiError(404, "Request not found");
    if (!(await accountsCanHandle(session, request.branch_id))) throw new ApiError(403, "Not your branch");

    const returnable =
      ACCOUNTS_PENDING_STATUSES.includes(request.status) ||
      request.status === EXACT_STATUS.PENDING_ACC_SUP;
    if (!returnable) {
      throw new ApiError(409, "Request is not pending accounts action.");
    }
    // Accounts users cannot return Acc-Sup queue items (those are Acc Sup only).
    if (
      request.status === EXACT_STATUS.PENDING_ACC_SUP &&
      session.role === "accounts"
    ) {
      throw new ApiError(403, "Only Accounts Supervisor can return this reimbursement.");
    }
    // Acc Sup cannot return their own Acc-Sup reimbursements sitting in payment queue for accounts.
    if (
      request.submitter_role === "accounts_supervisor" &&
      session.role !== "accounts" &&
      session.role !== "admin"
    ) {
      throw new ApiError(403, "Only Accounts can return Accounts Supervisor reimbursements.");
    }
    if (request.processing_by_user_id && request.processing_by_user_id !== session.id) {
      throw new ApiError(409, "Being processed by another accounts user.");
    }

    const newStatus =
      request.request_type === "exact" ? EXACT_STATUS.RETURNED : SUSPENSE_STATUS.RETURNED;

    await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE petty_cash_requests
            SET status = ?, reject_reason = ?, processing_by_user_id = NULL,
                approved_amount = NULL, approved_at = NULL
          WHERE id = ?`,
        [newStatus, String(comments).trim(), id]
      );

      await conn.execute(
        `INSERT INTO approvals (request_id, approver_user_id, approval_level, action, comments)
         VALUES (?,?,?,?,?)`,
        [id, session.id, "accounts", "return", String(comments).trim()]
      );

      await auditTx(conn, {
        userId: session.id,
        action: "accounts_return",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: { status: request.status },
        newValue: { status: newStatus },
      });
    });

    return ok();
  } catch (err) {
    return fail(err);
  }
}
