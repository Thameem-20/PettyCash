import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { deleteStoredFile } from "@/lib/files";
import { auditTx } from "@/lib/audit";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";

function isReturnedForCorrection(request: PettyCashRequest): boolean {
  const returned =
    request.request_type === "exact" ? EXACT_STATUS.RETURNED : SUSPENSE_STATUS.RETURNED;
  return request.status === returned;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; receiptId: string } }
) {
  try {
    const session = await requireApiSession(["cash_requester", "operations", "supervisor", "admin"]);
    const id = Number(params.id);
    const receiptId = Number(params.receiptId);

    const request = await queryOne<PettyCashRequest>("SELECT * FROM petty_cash_requests WHERE id = ?", [id]);
    if (!request) throw new ApiError(404, "Request not found");

    const returned =
      request.request_type === "exact" ? EXACT_STATUS.RETURNED : SUSPENSE_STATUS.RETURNED;
    if (request.status !== returned) {
      throw new ApiError(409, "Request is not awaiting correction.");
    }
    if (request.submitted_by_user_id !== session.id) {
      throw new ApiError(403, "Only the submitter can remove receipts during correction.");
    }

    const receipt = await queryOne<{ id: number; file_url: string; receipt_type: string }>(
      "SELECT id, file_url, receipt_type FROM receipts WHERE id = ? AND request_id = ?",
      [receiptId, id]
    );
    if (!receipt) throw new ApiError(404, "Receipt not found.");
    if (receipt.receipt_type !== "request") {
      throw new ApiError(400, "Only submission receipts can be removed during correction.");
    }

    await withTransaction(async (conn) => {
      await conn.execute("DELETE FROM receipts WHERE id = ? AND request_id = ?", [receiptId, id]);
      await deleteStoredFile(receipt.file_url);
      await auditTx(conn, {
        userId: session.id,
        action: "correction_receipt_delete",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: { receiptId },
      });
    });

    return ok();
  } catch (err) {
    return fail(err);
  }
}
