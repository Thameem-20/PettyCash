import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { accountsCanHandle } from "@/lib/requests";
import { auditTx } from "@/lib/audit";
import { ACCOUNTS_PENDING_STATUSES, EXACT_STATUS } from "@/lib/status";

/**
 * Accounts escalates a pending payment/issue request to Accounts Supervisor
 * for approval before Accounts may pay or issue.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts", "accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const body = await req.json().catch(() => ({}));
    const comments = body.comments != null ? String(body.comments).trim() : "";

    const request = await queryOne<PettyCashRequest>(
      "SELECT * FROM petty_cash_requests WHERE id = ?",
      [id]
    );
    if (!request) throw new ApiError(404, "Request not found");
    if (!(await accountsCanHandle(session, request.branch_id))) {
      throw new ApiError(403, "Not your branch");
    }

    if (!ACCOUNTS_PENDING_STATUSES.includes(request.status)) {
      throw new ApiError(
        409,
        "Only requests pending accounts payment or issue can be sent to Accounts Supervisor."
      );
    }

    // Staff accounts reimbursements already sit in Acc Sup queue by default.
    if (request.submitter_role === "accounts") {
      throw new ApiError(
        409,
        "Accounts user reimbursements already require Accounts Supervisor approve & pay."
      );
    }

    if (request.processing_by_user_id && request.processing_by_user_id !== session.id) {
      throw new ApiError(409, "Being processed by another accounts user.");
    }

    await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE petty_cash_requests
            SET status = ?, processing_by_user_id = NULL
          WHERE id = ?`,
        [EXACT_STATUS.PENDING_ACC_SUP, id]
      );

      await conn.execute(
        `INSERT INTO approvals (request_id, approver_user_id, approval_level, action, comments)
         VALUES (?,?,?,?,?)`,
        [
          id,
          session.id,
          "accounts",
          "escalate_accounts_supervisor",
          comments || "Sent to Accounts Supervisor for approval",
        ]
      );

      await auditTx(conn, {
        userId: session.id,
        action: "escalate_accounts_supervisor",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: { status: request.status },
        newValue: { status: EXACT_STATUS.PENDING_ACC_SUP },
      });
    });

    return ok();
  } catch (err) {
    return fail(err);
  }
}
