import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { accountsCanHandle } from "@/lib/requests";
import { postLedger } from "@/lib/ledger";
import { auditTx } from "@/lib/audit";
import { TOPUP_STATUS } from "@/lib/status";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts", "accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const t = await queryOne<{ status: string; branch_id: number; amount: number; top_up_no: string }>(
      "SELECT status, branch_id, amount, top_up_no FROM top_up_requests WHERE id = ?",
      [id]
    );
    if (!t) throw new ApiError(404, "Top-up not found");
    if (!(await accountsCanHandle(session, t.branch_id))) throw new ApiError(403, "Not your branch");
    if (t.status !== TOPUP_STATUS.CASH_RELEASED)
      throw new ApiError(409, "Cash has not been released by treasury yet.");

    await withTransaction(async (conn) => {
      await postLedger(conn, {
        branchId: t.branch_id,
        transactionType: "topup_received",
        credit: Number(t.amount),
        topUpId: id,
        createdByUserId: session.id,
        remarks: `Treasury top-up ${t.top_up_no}`,
      });
      await conn.execute(
        "UPDATE top_up_requests SET accounts_received_status='received', status=?, accounts_received_at=NOW() WHERE id=?",
        [TOPUP_STATUS.CLOSED, id]
      );
      await auditTx(conn, {
        userId: session.id,
        action: "topup_received",
        entityType: "top_up_request",
        entityId: id,
        newValue: { branchId: t.branch_id, amount: t.amount },
      });
    });
    return ok();
  } catch (err) {
    return fail(err);
  }
}
