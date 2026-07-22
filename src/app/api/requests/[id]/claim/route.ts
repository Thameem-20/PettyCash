import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, execute } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { accountsCanHandle, assertCanPayExact } from "@/lib/requests";
import { audit } from "@/lib/audit";
import { ACCOUNTS_PENDING_STATUSES, EXACT_STATUS } from "@/lib/status";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts", "accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const request = await queryOne<PettyCashRequest>("SELECT * FROM petty_cash_requests WHERE id = ?", [id]);
    if (!request) throw new ApiError(404, "Request not found");
    if (!(await accountsCanHandle(session, request.branch_id))) throw new ApiError(403, "Not your branch");

    const claimable =
      ACCOUNTS_PENDING_STATUSES.includes(request.status) ||
      request.status === EXACT_STATUS.PENDING_ACC_SUP;
    if (!claimable) throw new ApiError(409, "Request is not pending accounts action.");

    // Reuse pay routing so Acc Sup / Accounts claim only what they can pay.
    if (request.request_type === "exact") {
      const payErr = await assertCanPayExact(session, request);
      if (payErr && payErr !== "Not your branch") {
        // status mismatch already covered; role mismatch should block claim
        if (
          payErr.includes("Only") ||
          payErr.includes("cannot pay") ||
          payErr.includes("Accounts Supervisor")
        ) {
          throw new ApiError(403, payErr);
        }
      }
    }

    if (request.processing_by_user_id && request.processing_by_user_id !== session.id)
      throw new ApiError(409, "Already being processed by another accounts user.");

    await execute("UPDATE petty_cash_requests SET processing_by_user_id = ? WHERE id = ?", [session.id, id]);
    await audit({
      userId: session.id,
      action: "claim_processing",
      entityType: "petty_cash_request",
      entityId: id,
    });
    return ok();
  } catch (err) {
    return fail(err);
  }
}
