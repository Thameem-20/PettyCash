import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { auditTx } from "@/lib/audit";
import { TOPUP_STATUS } from "@/lib/status";
import { treasuryCanHandle } from "@/lib/requests";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["treasury", "admin"]);
    const id = Number(params.id);
    const t = await queryOne<{ status: string; branch_id: number }>(
      "SELECT status, branch_id FROM top_up_requests WHERE id = ?",
      [id]
    );
    if (!t) throw new ApiError(404, "Top-up not found");
    if (t.status !== TOPUP_STATUS.TREASURY_APPROVED)
      throw new ApiError(409, "Top-up must be treasury-approved before release.");
    if (!(await treasuryCanHandle(session, t.branch_id)))
      throw new ApiError(403, "Not assigned to this branch.");

    await withTransaction(async (conn) => {
      await conn.execute(
        "UPDATE top_up_requests SET treasury_released_status='released', status=?, cash_released_at=NOW() WHERE id=?",
        [TOPUP_STATUS.CASH_RELEASED, id]
      );
      await auditTx(conn, {
        userId: session.id,
        action: "topup_release",
        entityType: "top_up_request",
        entityId: id,
      });
    });
    return ok();
  } catch (err) {
    return fail(err);
  }
}
