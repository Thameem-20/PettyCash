import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { auditTx } from "@/lib/audit";
import { TOPUP_STATUS } from "@/lib/status";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["treasury", "admin"]);
    const id = Number(params.id);
    const { action, comments } = await req.json();
    const t = await queryOne<{ status: string }>("SELECT status FROM top_up_requests WHERE id = ?", [id]);
    if (!t) throw new ApiError(404, "Top-up not found");
    if (t.status !== TOPUP_STATUS.PENDING_TREASURY)
      throw new ApiError(409, "Not pending treasury approval.");
    if (action === "reject" && !String(comments || "").trim())
      throw new ApiError(400, "Reason required to reject.");

    await withTransaction(async (conn) => {
      if (action === "approve") {
        await conn.execute(
          "UPDATE top_up_requests SET treasury_status='approved', status=?, treasury_user_id=?, comments=?, treasury_approved_at=NOW() WHERE id=?",
          [TOPUP_STATUS.TREASURY_APPROVED, session.id, comments || null, id]
        );
      } else if (action === "reject") {
        await conn.execute(
          "UPDATE top_up_requests SET treasury_status='rejected', status=?, treasury_user_id=?, comments=? WHERE id=?",
          [TOPUP_STATUS.REJECTED_TREASURY, session.id, comments, id]
        );
      } else throw new ApiError(400, "Invalid action");

      await auditTx(conn, {
        userId: session.id,
        action: `topup_treasury_${action}`,
        entityType: "top_up_request",
        entityId: id,
      });
    });
    return ok();
  } catch (err) {
    return fail(err);
  }
}
