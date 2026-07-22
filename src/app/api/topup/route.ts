import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { queryOne, withTransaction } from "@/lib/db";
import { accountsCanHandle } from "@/lib/requests";
import { nextTopUpNo } from "@/lib/util";
import { auditTx } from "@/lib/audit";
import { TOPUP_STATUS } from "@/lib/status";
import { saveTopUpAttachment } from "@/lib/files";

const PAYMENT_SOURCES = new Set(["cash", "bank_account"]);

export async function POST(req: NextRequest) {
  try {
    const session = await requireApiSession(["accounts", "accounts_supervisor", "admin"]);
    const form = await req.formData();
    const branchId = Number(form.get("branch_id"));
    const amt = Number(form.get("amount"));
    const reason = String(form.get("reason") || "").trim();
    const cpNumber = String(form.get("cp_number") || "").trim();
    const paymentSource = String(form.get("payment_source") || "cash").trim();
    const bankAccountIdRaw = form.get("bank_account_id");
    const bankAccountId =
      bankAccountIdRaw != null && String(bankAccountIdRaw).trim() !== ""
        ? Number(bankAccountIdRaw)
        : null;
    const attachment = form.get("attachment");

    if (!branchId) throw new ApiError(400, "Branch is required");
    if (!(amt > 0)) throw new ApiError(400, "Amount must be positive");
    if (!PAYMENT_SOURCES.has(paymentSource)) {
      throw new ApiError(400, "Payment source must be Cash or Bank Account");
    }
    if (!(await accountsCanHandle(session, branchId))) throw new ApiError(403, "Not your branch");

    let bankAccountIdToStore: number | null = null;
    let bankAccountLabel: string | null = null;
    if (paymentSource === "bank_account") {
      if (!bankAccountId || !Number.isFinite(bankAccountId)) {
        throw new ApiError(400, "Select a bank account");
      }
      const bank = await queryOne<{ id: number; bank_name: string; last_four: string }>(
        `SELECT id, bank_name, last_four FROM bank_accounts
          WHERE id = ? AND branch_id = ? AND is_active = 1`,
        [bankAccountId, branchId]
      );
      if (!bank) throw new ApiError(400, "Selected bank account is not available for this branch");
      bankAccountIdToStore = bank.id;
      bankAccountLabel = `${bank.bank_name} ****${bank.last_four}`;
    }

    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;
    let attachmentMime: string | null = null;
    if (attachment instanceof File && attachment.size > 0) {
      const saved = await saveTopUpAttachment(attachment);
      attachmentUrl = saved.relPath;
      attachmentName = saved.originalName;
      attachmentMime = saved.mimeType;
    }

    const id = await withTransaction(async (conn) => {
      const no = await nextTopUpNo(conn);
      const [res] = await conn.execute<any>(
        `INSERT INTO top_up_requests
          (top_up_no, branch_id, requested_by_user_id, amount, reason, cp_number, payment_source,
           bank_account_id, bank_account_label,
           attachment_url, attachment_name, attachment_mime, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          no,
          branchId,
          session.id,
          amt,
          reason || null,
          cpNumber || null,
          paymentSource,
          bankAccountIdToStore,
          bankAccountLabel,
          attachmentUrl,
          attachmentName,
          attachmentMime,
          TOPUP_STATUS.PENDING_ACC_SUP,
        ]
      );
      const newId = res.insertId as number;
      await auditTx(conn, {
        userId: session.id,
        action: "create_topup",
        entityType: "top_up_request",
        entityId: newId,
        newValue: {
          no,
          branchId,
          amt,
          cpNumber: cpNumber || null,
          paymentSource,
          bankAccountId: bankAccountIdToStore,
          bankAccountLabel,
          attachment: attachmentName,
        },
      });
      return newId;
    });

    return ok({ id });
  } catch (err) {
    return fail(err);
  }
}
