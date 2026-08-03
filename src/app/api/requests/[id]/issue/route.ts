import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { accountsCanHandle } from "@/lib/requests";
import { postLedger } from "@/lib/ledger";
import { auditTx } from "@/lib/audit";
import { SUSPENSE_STATUS } from "@/lib/status";
import { isElevated } from "@/lib/rbac";
import { round2 } from "@/lib/util";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts", "accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const { amount: rawAmount, allow_negative, amount_reason } = await req.json();
    const requestedIssue = Number(rawAmount);

    const request = await queryOne<PettyCashRequest>("SELECT * FROM petty_cash_requests WHERE id = ?", [id]);
    if (!request) throw new ApiError(404, "Request not found");
    if (request.request_type !== "suspense") throw new ApiError(400, "Not a suspense request.");
    if (!(await accountsCanHandle(session, request.branch_id))) throw new ApiError(403, "Not your branch");
    if (request.status !== SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE)
      throw new ApiError(409, `Request is not ready to issue advance (status: ${request.status}).`);
    if (request.approved_amount == null) throw new ApiError(409, "Request has not been approved.");

    const approvedBaseline = round2(Number(request.approved_amount));
    const elevated = isElevated(session.role);
    let amount = round2(requestedIssue);
    if (!elevated) {
      amount = approvedBaseline;
    } else if (amount !== approvedBaseline) {
      const reason = String(amount_reason || "").trim();
      if (!reason) {
        throw new ApiError(400, "A reason is required when changing the advance amount.");
      }
    }

    if (!(amount > 0)) throw new ApiError(400, "Advance amount must be positive.");
    if (request.processing_by_user_id && request.processing_by_user_id !== session.id)
      throw new ApiError(409, "Being processed by another accounts user.");

    const allowNeg = Boolean(allow_negative) && elevated;
    const amountEdited = elevated && amount !== approvedBaseline;

    await withTransaction(async (conn) => {
      await postLedger(conn, {
        branchId: request.branch_id,
        transactionType: "suspense_issued",
        debit: amount,
        requestId: id,
        createdByUserId: session.id,
        remarks: `Suspense advance for ${request.request_no}`,
        allowNegative: allowNeg,
      });

      await conn.execute(
        `UPDATE petty_cash_requests
            SET status = ?, paid_amount = ?, approved_amount = ?,
                accounts_user_id = ?, processing_by_user_id = ?, paid_at = NOW()
          WHERE id = ?`,
        [SUSPENSE_STATUS.AWAITING_CASH_RECEIPT, amount, amount, session.id, session.id, id]
      );

      await conn.execute(
        `INSERT INTO approvals (request_id, approver_user_id, approval_level, action, comments, old_amount, new_amount)
         VALUES (?,?,?,?,?,?,?)`,
        [
          id,
          session.id,
          amountEdited ? "accounts_supervisor" : "accounts",
          amountEdited ? "edit_amount" : "issue",
          amountEdited
            ? `Suspense advance issued · Amount changed: ${String(amount_reason || "").trim()}`
            : "Suspense advance issued",
          amountEdited ? approvedBaseline : null,
          amount,
        ]
      );

      await auditTx(conn, {
        userId: session.id,
        action: "accounts_issue_suspense",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: { status: request.status },
        newValue: { status: SUSPENSE_STATUS.AWAITING_CASH_RECEIPT, paid_amount: amount },
      });
    });

    return ok();
  } catch (err) {
    return fail(err);
  }
}
