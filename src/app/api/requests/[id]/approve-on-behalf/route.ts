import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { accountsCanHandle } from "@/lib/requests";
import { auditTx } from "@/lib/audit";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";
import { money, round2 } from "@/lib/util";

/**
 * Accounts Supervisor covers for an absent supervisor:
 * approve / return / reject a request pending supervisor approval.
 * Keeps the assigned supervisor_id; activity records "… on behalf of …".
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "approve");
    const comments = body.comments != null ? String(body.comments).trim() : "";
    const approvedAmountRaw = body.approved_amount;
    const reason = body.reason != null ? String(body.reason).trim() : "";

    if (!["approve", "reject", "return"].includes(action)) {
      throw new ApiError(400, "Invalid action. Use approve, reject, or return.");
    }

    const request = await queryOne<PettyCashRequest & { supervisor_name: string | null }>(
      `SELECT r.*, sup.name AS supervisor_name
         FROM petty_cash_requests r
         LEFT JOIN users sup ON sup.id = r.supervisor_id
        WHERE r.id = ?`,
      [id]
    );
    if (!request) throw new ApiError(404, "Request not found");
    if (!(await accountsCanHandle(session, request.branch_id))) {
      throw new ApiError(403, "Not your branch");
    }

    if (request.submitted_by_user_id === session.id) {
      throw new ApiError(403, "You cannot act on your own request on behalf of a supervisor.");
    }

    const pendingStatus =
      request.request_type === "exact"
        ? EXACT_STATUS.PENDING_SUPERVISOR
        : SUSPENSE_STATUS.PENDING_SUPERVISOR;
    if (request.status !== pendingStatus) {
      throw new ApiError(
        409,
        `Request is not awaiting supervisor approval (status: ${request.status}).`
      );
    }

    if ((action === "reject" || action === "return") && !comments) {
      throw new ApiError(400, "A reason/comment is mandatory to reject or return.");
    }

    const supervisorName = request.supervisor_name?.trim() || "the assigned supervisor";

    let newStatus: string;
    let newApproved: number | null = request.approved_amount;
    let oldAmount: number | null = null;
    let approvalAction: string;
    let commentText: string;

    if (action === "approve") {
      newApproved = round2(Number(request.requested_amount));
      if (approvedAmountRaw != null && approvedAmountRaw !== "") {
        const edited = round2(Number(approvedAmountRaw));
        if (!(edited > 0)) throw new ApiError(400, "Approved amount must be positive.");
        if (edited !== round2(Number(request.requested_amount))) {
          if (!reason) {
            throw new ApiError(400, "Reason is mandatory when editing the approved amount.");
          }
          oldAmount = round2(Number(request.requested_amount));
          newApproved = edited;
        }
      }
      newStatus =
        request.request_type === "exact"
          ? EXACT_STATUS.PENDING_PAYMENT
          : SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE;
      approvalAction = "approve_on_behalf";
      const parts = [`Approved on behalf of ${supervisorName}`];
      if (comments) parts.push(comments);
      if (oldAmount != null && reason) parts.push(`Amount change: ${reason}`);
      commentText = parts.join(" · ");
    } else if (action === "reject") {
      newStatus =
        request.request_type === "exact" ? EXACT_STATUS.REJECTED : SUSPENSE_STATUS.REJECTED;
      approvalAction = "reject_on_behalf";
      commentText = `Rejected on behalf of ${supervisorName} · ${comments}`;
    } else {
      newStatus =
        request.request_type === "exact" ? EXACT_STATUS.RETURNED : SUSPENSE_STATUS.RETURNED;
      approvalAction = "return_on_behalf";
      commentText = `Returned for correction on behalf of ${supervisorName} · ${comments}`;
    }

    await withTransaction(async (conn) => {
      // Keep assigned supervisor_id — Acc Sup is covering, not replacing them.
      if (action === "approve") {
        await conn.execute(
          `UPDATE petty_cash_requests
              SET status = ?, approved_amount = ?, approved_at = NOW()
            WHERE id = ?`,
          [newStatus, newApproved, id]
        );
      } else {
        await conn.execute(
          `UPDATE petty_cash_requests
              SET status = ?, reject_reason = ?
            WHERE id = ?`,
          [newStatus, comments, id]
        );
      }

      await conn.execute(
        `INSERT INTO approvals
           (request_id, approver_user_id, approval_level, action, comments, old_amount, new_amount)
         VALUES (?,?,?,?,?,?,?)`,
        [
          id,
          session.id,
          "accounts_supervisor",
          approvalAction,
          commentText,
          oldAmount,
          oldAmount != null ? newApproved : null,
        ]
      );

      await auditTx(conn, {
        userId: session.id,
        action: `${action}_on_behalf_of_supervisor`,
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: {
          status: request.status,
          approved_amount: request.approved_amount,
          supervisor_id: request.supervisor_id,
        },
        newValue: {
          status: newStatus,
          approved_amount: newApproved,
          on_behalf_of: supervisorName,
          supervisor_id: request.supervisor_id,
          action,
        },
      });
    });

    return ok({
      status: newStatus,
      action,
      on_behalf_of: supervisorName,
      message:
        action === "approve"
          ? `${session.name} approved on behalf of ${supervisorName} (${money(newApproved)})`
          : `${session.name} ${action === "reject" ? "rejected" : "returned"} on behalf of ${supervisorName}`,
    });
  } catch (err) {
    return fail(err);
  }
}
