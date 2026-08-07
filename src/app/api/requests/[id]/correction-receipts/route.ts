import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { saveReceiptFiles } from "@/lib/files";
import { auditTx } from "@/lib/audit";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";

function isReturnedForCorrection(request: PettyCashRequest): boolean {
  const returned =
    request.request_type === "exact" ? EXACT_STATUS.RETURNED : SUSPENSE_STATUS.RETURNED;
  return request.status === returned;
}

async function assertSubmitterCorrectionAccess(
  session: { id: number },
  request: PettyCashRequest
) {
  if (!isReturnedForCorrection(request)) {
    throw new ApiError(409, "Request is not awaiting correction.");
  }
  if (request.submitted_by_user_id !== session.id) {
    throw new ApiError(403, "Only the submitter can update receipts during correction.");
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession([
      "cash_requester",
      "messenger",
      "operations",
      "supervisor",
      "accounts",
      "accounts_supervisor",
      "admin",
    ]);
    const id = Number(params.id);
    const request = await queryOne<PettyCashRequest>("SELECT * FROM petty_cash_requests WHERE id = ?", [id]);
    if (!request) throw new ApiError(404, "Request not found");
    await assertSubmitterCorrectionAccess(session, request);

    const form = await req.formData();
    const files = form.getAll("receipts").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) throw new ApiError(400, "Select at least one receipt to upload.");

    await withTransaction(async (conn) => {
      const saved = await saveReceiptFiles(files);
      await conn.execute(
        `INSERT INTO receipts (request_id, file_url, file_name, mime_type, uploaded_by_user_id, receipt_type)
         VALUES (?,?,?,?,?, 'request')`,
        [id, saved.relPath, saved.originalName, saved.mimeType, session.id]
      );

      await auditTx(conn, {
        userId: session.id,
        action: "correction_receipt_upload",
        entityType: "petty_cash_request",
        entityId: id,
        newValue: { pages: files.length },
      });
    });

    return ok();
  } catch (err) {
    return fail(err);
  }
}
