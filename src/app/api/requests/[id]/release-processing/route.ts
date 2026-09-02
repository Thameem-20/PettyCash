import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { accountsCanHandle } from "@/lib/requests";
import { auditTx } from "@/lib/audit";
import { ACCOUNTS_PENDING_STATUSES, EXACT_STATUS } from "@/lib/status";

/**
 * Clear the processing lock so another accounts user can pay or issue.
 * The current claimer, Accounts Supervisor, or admin may release it.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts", "accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const request = await queryOne<PettyCashRequest>(
      "SELECT * FROM petty_cash_requests WHERE id = ?",
      [id]
    );
    if (!request) throw new ApiError(404, "Request not found");
    if (!(await accountsCanHandle(session, request.branch_id))) {
      throw new ApiError(403, "Not your branch");
    }

    if (!request.processing_by_user_id) {
      throw new ApiError(409, "This request is not locked for processing.");
    }

    const claimable =
      ACCOUNTS_PENDING_STATUSES.includes(request.status) ||
      request.status === EXACT_STATUS.PENDING_ACC_SUP;
    if (!claimable) {
      throw new ApiError(409, "Request is not pending accounts action.");
    }

    const isHolder = request.processing_by_user_id === session.id;
    const holder = await queryOne<{ role: string }>(
      "SELECT role FROM users WHERE id = ?",
      [request.processing_by_user_id]
    );
    const canForceRelease =
      session.role === "accounts_supervisor" ||
      session.role === "admin" ||
      (session.role === "accounts" && holder?.role === "accounts_supervisor");
    if (!isHolder && !canForceRelease) {
      throw new ApiError(403, "Only the person processing this request can release it.");
    }

    await withTransaction(async (conn) => {
      await conn.execute(
        "UPDATE petty_cash_requests SET processing_by_user_id = NULL WHERE id = ?",
        [id]
      );

      await conn.execute(
        `INSERT INTO approvals (request_id, approver_user_id, approval_level, action, comments)
         VALUES (?,?,?,?,?)`,
        [
          id,
          session.id,
          session.role,
          "release_processing",
          isHolder
            ? "Released processing lock"
            : "Released processing lock so Accounts can pay",
        ]
      );

      await auditTx(conn, {
        userId: session.id,
        action: "release_processing",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: { processing_by_user_id: request.processing_by_user_id },
        newValue: { processing_by_user_id: null },
      });
    });

    return ok();
  } catch (err) {
    return fail(err);
  }
}
