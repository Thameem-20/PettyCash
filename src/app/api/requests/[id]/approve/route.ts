import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { auditTx } from "@/lib/audit";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";
import { getUserRoleForBranch } from "@/lib/branchMembership";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["supervisor", "admin"]);
    const id = Number(params.id);
    const { action, comments, approved_amount, reason } = await req.json();

    const request = await queryOne<PettyCashRequest>("SELECT * FROM petty_cash_requests WHERE id = ?", [id]);
    if (!request) throw new ApiError(404, "Request not found");

    if (request.submitted_by_user_id === session.id) {
      throw new ApiError(403, "You cannot approve your own request.");
    }

    const isAdmin = session.role === "admin" || session.primary_role === "admin";
    if (!isAdmin) {
      const roleOnBranch = await getUserRoleForBranch(session.id, request.branch_id);
      if (roleOnBranch !== "supervisor") {
        throw new ApiError(403, "You are not a supervisor on this request's branch.");
      }
    }

    const pendingStatus =
      request.request_type === "exact"
        ? EXACT_STATUS.PENDING_SUPERVISOR
        : SUSPENSE_STATUS.PENDING_SUPERVISOR;
    if (request.status !== pendingStatus) {
      throw new ApiError(409, `Request is not awaiting supervisor approval (status: ${request.status}).`);
    }

    if ((action === "reject" || action === "return") && !String(comments || "").trim()) {
      throw new ApiError(400, "A reason/comment is mandatory to reject or return.");
    }

    await withTransaction(async (conn) => {
      let newStatus: string;
      let newApproved = request.approved_amount;
      let oldAmount: number | null = null;

      if (action === "approve") {
        // optional amount edit
        if (approved_amount != null && Number(approved_amount) !== Number(request.requested_amount)) {
          if (!String(reason || "").trim()) {
            throw new ApiError(400, "Reason is mandatory when editing the approved amount.");
          }
          if (!(Number(approved_amount) > 0)) throw new ApiError(400, "Approved amount must be positive.");
          oldAmount = Number(request.requested_amount);
          newApproved = Number(approved_amount);
        } else {
          newApproved = Number(request.requested_amount);
        }
        newStatus =
          request.request_type === "exact"
            ? EXACT_STATUS.PENDING_PAYMENT
            : SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE;

        await conn.execute(
          "UPDATE petty_cash_requests SET status = ?, approved_amount = ?, supervisor_id = ?, approved_at = NOW() WHERE id = ?",
          [newStatus, newApproved, session.id, id]
        );
      } else if (action === "reject") {
        newStatus = request.request_type === "exact" ? EXACT_STATUS.REJECTED : SUSPENSE_STATUS.REJECTED;
        await conn.execute(
          "UPDATE petty_cash_requests SET status = ?, supervisor_id = ?, reject_reason = ? WHERE id = ?",
          [newStatus, session.id, comments, id]
        );
      } else if (action === "return") {
        newStatus = request.request_type === "exact" ? EXACT_STATUS.RETURNED : SUSPENSE_STATUS.RETURNED;
        await conn.execute(
          "UPDATE petty_cash_requests SET status = ?, supervisor_id = ?, reject_reason = ? WHERE id = ?",
          [newStatus, session.id, comments, id]
        );
      } else {
        throw new ApiError(400, "Invalid action");
      }

      await conn.execute(
        `INSERT INTO approvals (request_id, approver_user_id, approval_level, action, comments, old_amount, new_amount)
         VALUES (?,?,?,?,?,?,?)`,
        [
          id,
          session.id,
          "supervisor",
          action === "approve" && oldAmount != null ? "edit_amount" : action,
          comments || (action === "approve" ? "Approved" : null),
          oldAmount,
          oldAmount != null ? newApproved : null,
        ]
      );

      await auditTx(conn, {
        userId: session.id,
        action: `supervisor_${action}`,
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: { status: request.status, approved_amount: request.approved_amount },
        newValue: { status: newStatus, approved_amount: newApproved },
      });
    });

    return ok();
  } catch (err) {
    return fail(err);
  }
}
