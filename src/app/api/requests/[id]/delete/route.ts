import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { query, queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { accountsCanHandle } from "@/lib/requests";
import { auditTx } from "@/lib/audit";
import { CLOSED_STATUSES } from "@/lib/status";
import { deleteStoredFile } from "@/lib/files";

/**
 * Acc Sup / admin: hard-delete an unpaid request (before cash leaves the box).
 * Blocks Closed/Rejected and any request with paid_at or payment ledger rows.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const body = await req.json().catch(() => ({}));
    const confirm = String(body.confirm || "").trim();
    if (confirm !== "CONFIRM") {
      throw new ApiError(400, "Type CONFIRM to delete this payment. This action cannot be undone.");
    }

    const request = await queryOne<PettyCashRequest>(
      "SELECT * FROM petty_cash_requests WHERE id = ?",
      [id]
    );
    if (!request) throw new ApiError(404, "Request not found");
    if (!(await accountsCanHandle(session, request.branch_id))) {
      throw new ApiError(403, "Not your branch");
    }

    if (CLOSED_STATUSES.includes(request.status)) {
      throw new ApiError(409, "Closed or rejected requests cannot be deleted.");
    }
    if (request.paid_at != null || request.paid_amount != null) {
      throw new ApiError(
        409,
        "This request has already been paid or issued. Undo the payment first, or leave it in the workflow."
      );
    }

    const ledger = await queryOne<{ id: number }>(
      `SELECT id FROM cash_ledger
        WHERE request_id = ?
          AND transaction_type IN ('exact_paid', 'suspense_issued', 'additional_paid', 'suspense_returned', 'adjustment')
        LIMIT 1`,
      [id]
    );
    if (ledger) {
      throw new ApiError(
        409,
        "This request still has cash ledger entries. Clear leftover payment ledger (undo) before deleting."
      );
    }

    const receipts = await query<{ id: number; file_url: string }>(
      "SELECT id, file_url FROM receipts WHERE request_id = ?",
      [id]
    );

    await withTransaction(async (conn) => {
      await auditTx(conn, {
        userId: session.id,
        action: "delete_request",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: {
          request_no: request.request_no,
          status: request.status,
          request_type: request.request_type,
          branch_id: request.branch_id,
          submitted_by_user_id: request.submitted_by_user_id,
          requested_amount: request.requested_amount,
        },
        newValue: { deleted: true },
      });

      await conn.execute("DELETE FROM petty_cash_requests WHERE id = ?", [id]);
    });

    for (const r of receipts) {
      try {
        await deleteStoredFile(r.file_url);
      } catch {
        // Best-effort file cleanup; DB row is already gone.
      }
    }

    return ok({ deleted: true, request_no: request.request_no });
  } catch (err) {
    return fail(err);
  }
}
