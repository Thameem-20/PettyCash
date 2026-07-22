import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { assertCanPayExact } from "@/lib/requests";
import { postLedger } from "@/lib/ledger";
import { auditTx } from "@/lib/audit";
import { EXACT_STATUS } from "@/lib/status";
import { isElevated } from "@/lib/rbac";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts", "accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const { paid_amount, allow_negative } = await req.json();
    const amount = Number(paid_amount);

    const request = await queryOne<PettyCashRequest>("SELECT * FROM petty_cash_requests WHERE id = ?", [id]);
    if (!request) throw new ApiError(404, "Request not found");

    const payErr = await assertCanPayExact(session, request);
    if (payErr) {
      const status = payErr === "Not your branch" ? 403 : 409;
      throw new ApiError(status, payErr);
    }

    if (!(amount > 0)) throw new ApiError(400, "Paid amount must be positive.");

    if (request.processing_by_user_id && request.processing_by_user_id !== session.id) {
      throw new ApiError(409, "Being processed by another accounts user.");
    }

    const allowNeg = Boolean(allow_negative) && isElevated(session.role);
    const isAccSupApprovePay =
      request.submitter_role === "accounts" &&
      (session.role === "accounts_supervisor" || session.role === "admin");

    await withTransaction(async (conn) => {
      await postLedger(conn, {
        branchId: request.branch_id,
        transactionType: "exact_paid",
        debit: amount,
        requestId: id,
        createdByUserId: session.id,
        remarks: `Exact payment for ${request.request_no}`,
        allowNegative: allowNeg,
      });

      const approvedAmount = request.approved_amount ?? amount;

      await conn.execute(
        `UPDATE petty_cash_requests
            SET status = ?, paid_amount = ?, approved_amount = ?,
                accounts_user_id = ?, processing_by_user_id = ?,
                paid_at = NOW(),
                approved_at = COALESCE(approved_at, NOW())
          WHERE id = ?`,
        [EXACT_STATUS.AWAITING_RECEIVER, amount, approvedAmount, session.id, session.id, id]
      );

      await conn.execute(
        `INSERT INTO approvals (request_id, approver_user_id, approval_level, action, comments, new_amount)
         VALUES (?,?,?,?,?,?)`,
        [
          id,
          session.id,
          isAccSupApprovePay ? "accounts_supervisor" : "accounts",
          isAccSupApprovePay ? "approve_pay" : "pay",
          isAccSupApprovePay ? "Approved and marked as paid" : "Marked as paid",
          amount,
        ]
      );

      await auditTx(conn, {
        userId: session.id,
        action: isAccSupApprovePay ? "accounts_supervisor_approve_pay" : "accounts_pay",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: { status: request.status },
        newValue: { status: EXACT_STATUS.AWAITING_RECEIVER, paid_amount: amount },
      });
    });

    return ok();
  } catch (err) {
    return fail(err);
  }
}
