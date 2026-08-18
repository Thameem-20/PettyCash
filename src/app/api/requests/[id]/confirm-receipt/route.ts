import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { auditTx } from "@/lib/audit";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";
import { isElevated } from "@/lib/rbac";
import {
  isRoleSupervisorReceiver,
  resolveSupervisorCashReceiverUserId,
  syncRoleSupervisorCashReceiver,
} from "@/lib/supervisorCashReceiver";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession();
    const id = Number(params.id);
    const body = await req.json().catch(() => ({}));
    const remarks =
      body.remarks != null
        ? String(body.remarks).trim()
        : body.note != null
          ? String(body.note).trim()
          : "";

    const request = await queryOne<PettyCashRequest>("SELECT * FROM petty_cash_requests WHERE id = ?", [id]);
    if (!request) throw new ApiError(404, "Request not found");

    let roleSupervisorId: number | null = null;
    if (isRoleSupervisorReceiver(request.cash_receiver_label)) {
      roleSupervisorId = await resolveSupervisorCashReceiverUserId(
        request.submitted_by_user_id,
        request.branch_id
      );
    }

    const isAdminOrElevated =
      isElevated(session.role) ||
      session.role === "admin" ||
      session.primary_role === "admin";
    const isReceiver =
      request.cash_receiver_user_id === session.id ||
      request.submitted_by_user_id === session.id ||
      (roleSupervisorId != null && roleSupervisorId === session.id);
    const confirmingOnBehalf = !isReceiver && isAdminOrElevated;
    if (!isReceiver && !isAdminOrElevated) {
      throw new ApiError(403, "Only the cash receiver can confirm receipt.");
    }
    if (confirmingOnBehalf && !remarks) {
      throw new ApiError(
        400,
        "Remarks are required when confirming on behalf of the cash receiver."
      );
    }

    await withTransaction(async (conn) => {
      if (isRoleSupervisorReceiver(request.cash_receiver_label)) {
        await syncRoleSupervisorCashReceiver(conn, request);
      }

      let newStatus: string;
      if (request.request_type === "exact") {
        if (request.status !== EXACT_STATUS.AWAITING_RECEIVER)
          throw new ApiError(409, "Not awaiting receiver confirmation.");
        newStatus = EXACT_STATUS.CLOSED;
        await conn.execute(
          "UPDATE petty_cash_requests SET status = ?, closed_at = NOW() WHERE id = ?",
          [newStatus, id]
        );
      } else {
        if (request.status !== SUSPENSE_STATUS.AWAITING_CASH_RECEIPT)
          throw new ApiError(409, "Not awaiting cash receipt confirmation.");
        newStatus = SUSPENSE_STATUS.OPEN_SUSPENSE;
        await conn.execute("UPDATE petty_cash_requests SET status = ? WHERE id = ?", [newStatus, id]);
      }

      const comment = confirmingOnBehalf
        ? `Cash receipt confirmed on behalf of receiver. Note: ${remarks}`
        : remarks
          ? `Cash received confirmed. Note: ${remarks}`
          : "Cash received confirmed";

      await conn.execute(
        `INSERT INTO approvals (request_id, approver_user_id, approval_level, action, comments)
         VALUES (?,?,?,?,?)`,
        [id, session.id, "receiver", "confirm_receipt", comment]
      );

      await auditTx(conn, {
        userId: session.id,
        action: "confirm_receipt",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: { status: request.status },
        newValue: { status: newStatus, remarks: remarks || null },
      });
    });

    return ok();
  } catch (err) {
    return fail(err);
  }
}
