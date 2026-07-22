import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { saveReceiptFiles } from "@/lib/files";
import { auditTx } from "@/lib/audit";
import { SUSPENSE_STATUS } from "@/lib/status";
import { isElevated } from "@/lib/rbac";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession();
    const id = Number(params.id);
    const request = await queryOne<PettyCashRequest>("SELECT * FROM petty_cash_requests WHERE id = ?", [id]);
    if (!request) throw new ApiError(404, "Request not found");
    if (request.request_type !== "suspense") throw new ApiError(400, "Not a suspense request.");

    const isOwner =
      request.cash_receiver_user_id === session.id || request.submitted_by_user_id === session.id;
    if (!isOwner && !isElevated(session.role)) throw new ApiError(403, "Not allowed.");
    if (request.status !== SUSPENSE_STATUS.OPEN_SUSPENSE)
      throw new ApiError(409, `Request is not in open suspense (status: ${request.status}).`);

    const form = await req.formData();
    const files = form.getAll("receipts").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) throw new ApiError(422, "A final receipt is mandatory for settlement.");

    await withTransaction(async (conn) => {
      const saved = await saveReceiptFiles(files);
      await conn.execute(
        `INSERT INTO receipts (request_id, file_url, file_name, mime_type, uploaded_by_user_id, receipt_type)
         VALUES (?,?,?,?,?, 'settlement')`,
        [id, saved.relPath, saved.originalName, saved.mimeType, session.id]
      );
      await conn.execute("UPDATE petty_cash_requests SET status = ? WHERE id = ?", [
        SUSPENSE_STATUS.PENDING_SETTLEMENT_REVIEW,
        id,
      ]);
      await auditTx(conn, {
        userId: session.id,
        action: "settle_receipt_upload",
        entityType: "petty_cash_request",
        entityId: id,
        newValue: { status: SUSPENSE_STATUS.PENDING_SETTLEMENT_REVIEW, pages: files.length },
      });
    });

    return ok();
  } catch (err) {
    return fail(err);
  }
}
