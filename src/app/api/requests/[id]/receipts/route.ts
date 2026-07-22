import { NextRequest, NextResponse } from "next/server";
import { ApiError, fail, requireApiSession } from "@/lib/api";
import {
  accountsCanHandle,
  canViewRequest,
  getReceipts,
  getRequestById,
} from "@/lib/requests";
import { generateCombinedReceiptsPdf } from "@/lib/pettyCashReceiptPdf";

export const dynamic = "force-dynamic";

/** Combined PDF of all receipts attached to a request (reports / multi-file view). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession([
      "accounts",
      "accounts_supervisor",
      "admin",
      "cash_requester",
      "messenger",
      "operations",
      "supervisor",
    ]);
    const id = Number(params.id);
    const request = await getRequestById(id);
    if (!request) throw new ApiError(404, "Request not found");

    const canAccess =
      (await accountsCanHandle(session, request.branch_id)) ||
      (await canViewRequest(session, request));
    if (!canAccess) throw new ApiError(403, "Not authorized.");

    const receipts = await getReceipts(id);
    if (!receipts.length) throw new ApiError(404, "No receipts for this request.");

    const pdf = await generateCombinedReceiptsPdf(receipts);
    const safeName = `${request.request_no.replace(/[^a-zA-Z0-9-_]/g, "")}-receipts.pdf`;

    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    return fail(err);
  }
}
