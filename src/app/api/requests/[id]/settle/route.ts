import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { query, queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { accountsCanHandle } from "@/lib/requests";
import { postLedger } from "@/lib/ledger";
import { auditTx } from "@/lib/audit";
import { SUSPENSE_STATUS } from "@/lib/status";
import { isElevated } from "@/lib/rbac";
import { round2, nextRequestNo } from "@/lib/util";
import { sumSuspenseReturns } from "@/lib/suspenseReturns";

type ChargeActualInput = { charge_id: number; actual_amount: number };

// Settle a suspense (accounts for any prior partial returns):
//   remaining = advance - actual - already_returned
//   remaining > 0 -> return remaining (credit)
//   remaining < 0 -> pay additional (debit)
//   remaining = 0 -> close with prior returns only
// Close only when advance + additional == actual + total_returned.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts", "accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const body = await req.json();
    const { allow_negative } = body;

    const request = await queryOne<PettyCashRequest>("SELECT * FROM petty_cash_requests WHERE id = ?", [id]);
    if (!request) throw new ApiError(404, "Request not found");
    if (request.request_type !== "suspense") throw new ApiError(400, "Not a suspense request.");
    if (!(await accountsCanHandle(session, request.branch_id))) throw new ApiError(403, "Not your branch");

    if (
      request.status !== SUSPENSE_STATUS.PENDING_SETTLEMENT_REVIEW &&
      request.status !== SUSPENSE_STATUS.RECEIPT_SUBMITTED
    ) {
      throw new ApiError(409, `Request is not ready for settlement (status: ${request.status}).`);
    }

    const receipt = await queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM receipts WHERE request_id = ? AND receipt_type = 'settlement'",
      [id]
    );
    if (!receipt || Number(receipt.c) === 0) {
      throw new ApiError(422, "A settlement receipt is required before closing the suspense.");
    }

    const charges = await query<{ id: number }>(
      "SELECT id FROM request_charges WHERE request_id = ? ORDER BY sort_order, id",
      [id]
    );

    let chargeActuals: ChargeActualInput[] = [];
    let actual: number;

    if (charges.length > 0) {
      if (Array.isArray(body.charge_actuals) && body.charge_actuals.length > 0) {
        chargeActuals = body.charge_actuals.map((row: { charge_id?: unknown; actual_amount?: unknown }) => ({
          charge_id: Number(row.charge_id),
          actual_amount: Number(row.actual_amount),
        }));
      } else if (charges.length === 1 && body.actual_expense_amount != null && body.actual_expense_amount !== "") {
        chargeActuals = [
          {
            charge_id: charges[0].id,
            actual_amount: Number(body.actual_expense_amount),
          },
        ];
      } else {
        throw new ApiError(400, "Per-charge actual amounts are required.");
      }

      const byId = new Map(chargeActuals.map((c) => [c.charge_id, c.actual_amount]));
      if (byId.size !== charges.length || !charges.every((c) => byId.has(c.id))) {
        throw new ApiError(400, "Actual amounts must be provided for every charge.");
      }

      for (const c of charges) {
        const a = byId.get(c.id)!;
        if (!(a >= 0) || !Number.isFinite(a)) {
          throw new ApiError(400, "Each charge actual expense must be zero or positive.");
        }
      }

      actual = round2(charges.reduce((sum, c) => sum + Number(byId.get(c.id) || 0), 0));
      chargeActuals = charges.map((c) => ({
        charge_id: c.id,
        actual_amount: round2(Number(byId.get(c.id) || 0)),
      }));
    } else {
      actual = Number(body.actual_expense_amount);
      if (!(actual >= 0) || !Number.isFinite(actual)) {
        throw new ApiError(400, "Actual expense must be zero or positive.");
      }
      actual = round2(actual);
    }

    const advance = Number(request.paid_amount || 0);
    const alreadyReturned = round2(Number(request.returned_amount || 0));
    const remaining = round2(advance - actual - alreadyReturned);
    const allowNeg = Boolean(allow_negative) && isElevated(session.role);

    await withTransaction(async (conn) => {
      let returnedThis = 0;
      let additional = 0;

      if (remaining > 0) {
        returnedThis = remaining;
        await conn.execute(
          `INSERT INTO suspense_returns (request_id, amount, note, recorded_by_user_id)
           VALUES (?,?,?,?)`,
          [id, returnedThis, "Final return at settlement", session.id]
        );
        await postLedger(conn, {
          branchId: request.branch_id,
          transactionType: "suspense_returned",
          credit: returnedThis,
          requestId: id,
          createdByUserId: session.id,
          remarks: `Suspense balance returned for ${request.request_no}`,
        });
      } else if (remaining < 0) {
        additional = -remaining;
        await postLedger(conn, {
          branchId: request.branch_id,
          transactionType: "additional_paid",
          debit: additional,
          requestId: id,
          createdByUserId: session.id,
          remarks: `Additional suspense paid for ${request.request_no}`,
          allowNegative: allowNeg,
        });
      }

      const totalReturned = await sumSuspenseReturns(conn, id);
      const balanced = round2(advance + additional) === round2(actual + totalReturned);
      if (!balanced) {
        throw new ApiError(422, "Settlement does not balance. Suspense cannot be closed.");
      }

      for (const ca of chargeActuals) {
        await conn.execute(
          `UPDATE request_charges SET actual_amount = ? WHERE id = ? AND request_id = ?`,
          [ca.actual_amount, ca.charge_id, id]
        );
      }

      const closedRequestNo = await nextRequestNo(conn, "closed_suspense");

      await conn.execute(
        `UPDATE petty_cash_requests
            SET status = ?, actual_expense_amount = ?, returned_amount = ?, additional_paid_amount = ?,
                closed_request_no = ?, closed_at = NOW()
          WHERE id = ?`,
        [SUSPENSE_STATUS.CLOSED, actual, totalReturned, additional, closedRequestNo, id]
      );

      await conn.execute(
        `INSERT INTO approvals (request_id, approver_user_id, approval_level, action, comments)
         VALUES (?,?,?,?,?)`,
        [
          id,
          session.id,
          "accounts",
          "settle",
          `Actual ${actual}, returned ${totalReturned} (this settlement ${returnedThis}), additional ${additional}`,
        ]
      );

      await auditTx(conn, {
        userId: session.id,
        action: "settle_suspense",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: { status: request.status, returned_amount: alreadyReturned },
        newValue: {
          status: SUSPENSE_STATUS.CLOSED,
          closed_request_no: closedRequestNo,
          actual,
          returned: totalReturned,
          returned_this_settlement: returnedThis,
          additional,
          charge_actuals: chargeActuals,
        },
      });
    });

    return ok();
  } catch (err) {
    return fail(err);
  }
}
