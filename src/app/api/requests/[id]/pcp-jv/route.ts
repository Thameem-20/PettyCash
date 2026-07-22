import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { accountsCanHandle } from "@/lib/requests";
import { auditTx } from "@/lib/audit";
import { codingType, getBranchProfile } from "@/lib/branchProfile";
import { isElevated } from "@/lib/rbac";

function normalizeCode(input: unknown, label: string): string {
  const value = String(input ?? "").trim();
  if (!value) throw new ApiError(422, `Enter ${label}.`);
  if (value.length > 80) throw new ApiError(422, `${label} is too long.`);
  return value;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts", "accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const body = await req.json();
    const pcpNumber = normalizeCode(body.pcp_number, "PCP number");
    const jvNumber = normalizeCode(body.jv_number, "JV");

    const request = await queryOne<PettyCashRequest>(
      `SELECT r.* FROM petty_cash_requests r WHERE r.id = ?`,
      [id]
    );
    if (!request) throw new ApiError(404, "Request not found");
    const profile = await getBranchProfile(request.branch_id);
    if (codingType(profile) !== "pcp_jv") {
      throw new ApiError(422, "This branch does not use PCP / JV coding.");
    }

    const canHandle =
      isElevated(session.role) || (await accountsCanHandle(session, request.branch_id));
    if (!canHandle) throw new ApiError(403, "Not your branch");

    if (!request.paid_at || request.paid_amount == null) {
      throw new ApiError(422, "Request must be paid before entering PCP / JV.");
    }

    await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE petty_cash_requests
            SET pcp_number = ?, jv_number = ?, pcp_jv_at = NOW()
          WHERE id = ?`,
        [pcpNumber, jvNumber, id]
      );

      await auditTx(conn, {
        userId: session.id,
        action: "pcp_jv_set",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: {
          pcp_number: request.pcp_number,
          jv_number: request.jv_number,
        },
        newValue: { pcp_number: pcpNumber, jv_number: jvNumber },
      });
    });

    return ok({ pcp_number: pcpNumber, jv_number: jvNumber });
  } catch (err) {
    return fail(err);
  }
}
