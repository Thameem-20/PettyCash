import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { auditTx } from "@/lib/audit";
import { TOPUP_STATUS } from "@/lib/status";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["treasury", "admin"]);
    const id = Number(params.id);
    const t = await queryOne<{ status: string }>("SELECT status FROM top_up_requests WHERE id = ?", [id]);
    if (!t) throw new ApiError(404, "Top-up not found");
    if (t.status !== TOPUP_STATUS.TREASURY_APPROVED)
      throw new ApiError(409, "Top-up must be treasury-approved before release.");

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
