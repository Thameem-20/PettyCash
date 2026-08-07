import { NextRequest, NextResponse } from "next/server";
import { ApiError, fail, requireApiSession } from "@/lib/api";
import {
  accountsCanHandle,
  canViewRequest,
  getAccSupPaymentApproval,
  getCashReceiptConfirmation,
  getJobNumbers,
  getReceipts,
  getRequestById,
  getRequestCharges,
  isPaymentReceiptDownloadReady,
  parseConfirmReceiptNote,
} from "@/lib/requests";
import { generatePettyCashPaymentReceiptPdf } from "@/lib/pettyCashReceiptPdf";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession([
      "accounts",
      "accounts_supervisor",
      "admin",
    ]);
    const id = Number(params.id);
    const request = await getRequestById(id);
    if (!request) throw new ApiError(404, "Request not found");

    const canAccess =
      (await accountsCanHandle(session, request.branch_id)) ||
      (await canViewRequest(session, request));
    if (!canAccess) throw new ApiError(403, "Not authorized.");

    if (!isPaymentReceiptDownloadReady(request)) {
      throw new ApiError(
        409,
        "Receipt is available only after the messenger confirms cash received."
      );
    }

    const [jobNumbers, receipts, cashConfirmed, charges, accSupApproved] = await Promise.all([
      getJobNumbers(id),
      getReceipts(id),
      getCashReceiptConfirmation(id),
      getRequestCharges(id),
      getAccSupPaymentApproval(id),
    ]);
    const messengerReceipts = receipts.filter((r) => r.receipt_type === "request");

    const pdf = await generatePettyCashPaymentReceiptPdf(
      request,
      jobNumbers,
      messengerReceipts,
      cashConfirmed
        ? {
            name: cashConfirmed.approver_name,
            date: cashConfirmed.created_at,
            note: parseConfirmReceiptNote(cashConfirmed.comments),
          }
        : null,
      charges,
      accSupApproved
        ? { name: accSupApproved.approver_name, date: accSupApproved.created_at }
        : null
    );
    const zyboCode = request.zybo_voucher_code?.trim();
    const safeZybo = zyboCode ? zyboCode.replace(/[^a-zA-Z0-9-_]/g, "") : "";
    const safeName = safeZybo
      ? `${safeZybo}.pdf`
      : `${request.request_no.replace(/[^a-zA-Z0-9-_]/g, "")}-payment-receipt.pdf`;

    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    return fail(err);
  }
}
