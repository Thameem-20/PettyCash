import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { accountsCanHandle } from "@/lib/requests";
import { postLedger } from "@/lib/ledger";
import { auditTx } from "@/lib/audit";
import { SUSPENSE_STATUS } from "@/lib/status";
import { money, round2 } from "@/lib/util";
import { outstandingSuspense, sumSuspenseReturns } from "@/lib/suspenseReturns";

/**
 * Record a partial cash return against an open suspense.
 * Credits branch cash, keeps the request open, logs history in suspense_returns.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts", "accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const body = await req.json();
    const amount = round2(Number(body.amount));
    const note = body.note != null ? String(body.note).trim() || null : null;

    if (!(amount > 0) || !Number.isFinite(amount)) {
      throw new ApiError(400, "Return amount must be greater than zero.");
    }

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
      throw new ApiError(
        409,
        "Partial returns are only allowed while the suspense is open (before final settlement)."
      );
    }

    const outstanding = outstandingSuspense(request);
    if (amount > outstanding) {
      throw new ApiError(
        422,
        `Return amount cannot exceed outstanding balance (${money(outstanding)}).`
      );
    }

    await withTransaction(async (conn) => {
      await conn.execute(
        `INSERT INTO suspense_returns (request_id, amount, note, recorded_by_user_id)
         VALUES (?,?,?,?)`,
        [id, amount, note, session.id]
      );

      const totalReturned = await sumSuspenseReturns(conn, id);

      await conn.execute(
        `UPDATE petty_cash_requests SET returned_amount = ? WHERE id = ?`,
        [totalReturned, id]
      );

      await postLedger(conn, {
        branchId: request.branch_id,
        transactionType: "suspense_returned",
        credit: amount,
        requestId: id,
        createdByUserId: session.id,
        remarks: `Partial suspense return for ${request.request_no}${note ? `: ${note}` : ""}`,
      });

      await conn.execute(
        `INSERT INTO approvals (request_id, approver_user_id, approval_level, action, comments, new_amount)
         VALUES (?,?,?,?,?,?)`,
        [
          id,
          session.id,
          "accounts",
          "partial_return",
          note || `Partial return ${money(amount)}`,
          amount,
        ]
      );

      await auditTx(conn, {
        userId: session.id,
        action: "partial_suspense_return",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: { returned_amount: request.returned_amount, outstanding },
        newValue: {
          return_amount: amount,
          returned_amount: totalReturned,
          outstanding: round2(outstanding - amount),
          note,
        },
      });
    });

    return ok({
      returned: amount,
      returned_total: round2(Number(request.returned_amount || 0) + amount),
      outstanding: round2(outstanding - amount),
    });
  } catch (err) {
    return fail(err);
  }
}
