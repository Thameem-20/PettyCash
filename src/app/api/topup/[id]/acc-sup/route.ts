import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { auditTx } from "@/lib/audit";
import { TOPUP_STATUS } from "@/lib/status";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const { action, comments } = await req.json();
    const t = await queryOne<{ status: string }>("SELECT status FROM top_up_requests WHERE id = ?", [id]);
    if (!t) throw new ApiError(404, "Top-up not found");
    if (t.status !== TOPUP_STATUS.PENDING_ACC_SUP)
      throw new ApiError(409, "Not pending accounts supervisor approval.");
    if (action === "reject" && !String(comments || "").trim())
      throw new ApiError(400, "Reason required to reject.");

    await withTransaction(async (conn) => {
      if (action === "approve") {
        await conn.execute(
          "UPDATE top_up_requests SET accounts_supervisor_status='approved', status=?, accounts_supervisor_id=?, comments=?, supervisor_approved_at=NOW() WHERE id=?",
          [TOPUP_STATUS.PENDING_TREASURY, session.id, comments || null, id]
        );
      } else if (action === "reject") {
        await conn.execute(
          "UPDATE top_up_requests SET accounts_supervisor_status='rejected', status=?, accounts_supervisor_id=?, comments=? WHERE id=?",
          [TOPUP_STATUS.REJECTED_ACC_SUP, session.id, comments, id]
        );
      } else throw new ApiError(400, "Invalid action");

      await auditTx(conn, {
        userId: session.id,
        action: `topup_accsup_${action}`,
        entityType: "top_up_request",
        entityId: id,
      });
    });
    return ok();
  } catch (err) {
    return fail(err);
  }
}
