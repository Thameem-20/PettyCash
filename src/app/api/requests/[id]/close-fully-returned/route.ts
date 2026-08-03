import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { withTransaction, queryOne } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { accountsCanHandle } from "@/lib/requests";
import { auditTx } from "@/lib/audit";
import { SUSPENSE_STATUS } from "@/lib/status";
import { money, nextRequestNo, round2 } from "@/lib/util";
import { outstandingSuspense, sumSuspenseReturns } from "@/lib/suspenseReturns";

/**
 * Close an open suspense with no settlement receipt when the advance has been
 * fully returned via partial returns (outstanding = 0, no expense).
 * No new ledger posting — cash was already credited on each return.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts", "accounts_supervisor", "admin"]);
    const id = Number(params.id);

    const request = await queryOne<PettyCashRequest>(
      "SELECT * FROM petty_cash_requests WHERE id = ?",
      [id]
    );
    if (!request) throw new ApiError(404, "Request not found");
    if (request.request_type !== "suspense") throw new ApiError(400, "Not a suspense request.");
    if (!(await accountsCanHandle(session, request.branch_id))) {
      throw new ApiError(403, "Not your branch");
    }
    if (request.status !== SUSPENSE_STATUS.OPEN_SUSPENSE) {
      throw new ApiError(409, "Only open suspense can be closed as fully returned.");
    }

    const outstanding = outstandingSuspense(request);
    if (outstanding !== 0) {
      throw new ApiError(
        422,
        `Outstanding balance must be zero before closing without a receipt (currently ${money(outstanding)}).`
      );
    }

    const paid = round2(Number(request.paid_amount || 0));
    if (!(paid > 0)) {
      throw new ApiError(422, "No advance was issued on this request.");
    }

    await withTransaction(async (conn) => {
      const totalReturned = await sumSuspenseReturns(conn, id);
      if (round2(totalReturned) !== paid) {
        throw new ApiError(
          422,
          `Returned total (${money(totalReturned)}) must equal the advance (${money(paid)}).`
        );
      }

      await conn.execute(
        `UPDATE request_charges SET actual_amount = 0 WHERE request_id = ?`,
        [id]
      );

      const closedRequestNo = await nextRequestNo(conn, "closed_suspense");

      await conn.execute(
        `UPDATE petty_cash_requests
            SET status = ?, actual_expense_amount = 0, returned_amount = ?, additional_paid_amount = 0,
                closed_request_no = ?, closed_at = NOW()
          WHERE id = ?`,
        [SUSPENSE_STATUS.CLOSED, totalReturned, closedRequestNo, id]
      );

      await conn.execute(
        `INSERT INTO approvals (request_id, approver_user_id, approval_level, action, comments)
         VALUES (?,?,?,?,?)`,
        [
          id,
          session.id,
          "accounts",
          "close_fully_returned",
          `Closed as fully returned — no expense. Advance ${money(paid)}, returned ${money(totalReturned)}.`,
        ]
      );

      await auditTx(conn, {
        userId: session.id,
        action: "close_fully_returned_suspense",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: { status: request.status, returned_amount: request.returned_amount },
        newValue: {
          status: SUSPENSE_STATUS.CLOSED,
          closed_request_no: closedRequestNo,
          actual: 0,
          returned: totalReturned,
        },
      });
    });

    return ok();
  } catch (err) {
    return fail(err);
  }
}
