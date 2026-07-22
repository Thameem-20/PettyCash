import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { PettyCashRequest } from "@/lib/types";
import { accountsCanHandle } from "@/lib/requests";
import { auditTx } from "@/lib/audit";
import {
  buildZyboVoucherCode,
  normalizeZyboSuffix,
} from "@/lib/zyboVoucher";
import { resolveZyboBranchSegment } from "@/lib/zyboVoucherServer";
import { isElevated } from "@/lib/rbac";
import { codingType, getBranchProfile } from "@/lib/branchProfile";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["accounts", "accounts_supervisor", "admin"]);
    const id = Number(params.id);
    const { suffix } = await req.json();
    const normalized = normalizeZyboSuffix(String(suffix ?? ""));
    if (!normalized) throw new ApiError(422, "Enter digits for the voucher code.");

    const request = await queryOne<PettyCashRequest>(
      `SELECT r.* FROM petty_cash_requests r WHERE r.id = ?`,
      [id]
    );
    if (!request) throw new ApiError(404, "Request not found");
    const profile = await getBranchProfile(request.branch_id);
    if (codingType(profile) !== "zybo") {
      throw new ApiError(422, "This branch does not use Zybo VC. Use PCP / JV instead.");
    }

    const canHandle =
      isElevated(session.role) || (await accountsCanHandle(session, request.branch_id));
    if (!canHandle) throw new ApiError(403, "Not your branch");

    const branchSegment = await resolveZyboBranchSegment(request.branch_id, request.job_number);
    const voucherCode = buildZyboVoucherCode(branchSegment, normalized);

    await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE petty_cash_requests
            SET zybo_voucher_suffix = ?, zybo_voucher_code = ?, zybo_voucher_at = NOW()
          WHERE id = ?`,
        [normalized, voucherCode, id]
      );

      await auditTx(conn, {
        userId: session.id,
        action: "zybo_voucher_set",
        entityType: "petty_cash_request",
        entityId: id,
        oldValue: {
          zybo_voucher_code: request.zybo_voucher_code,
          zybo_voucher_suffix: request.zybo_voucher_suffix,
        },
        newValue: { zybo_voucher_code: voucherCode, zybo_voucher_suffix: normalized },
      });
    });

    return ok({ zybo_voucher_code: voucherCode, zybo_voucher_suffix: normalized });
  } catch (err) {
    return fail(err);
  }
}
