import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { ApiError, fail, requireApiSession } from "@/lib/api";
import { contentDispositionHeader, readReceiptFile } from "@/lib/files";

export const dynamic = "force-dynamic";

const APPROVAL_ROLES = new Set(["accounts", "accounts_supervisor", "treasury", "admin"]);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession();
    if (!APPROVAL_ROLES.has(session.role)) {
      throw new ApiError(403, "Not allowed");
    }

    const topUp = await queryOne<{
      attachment_url: string | null;
      attachment_name: string | null;
      attachment_mime: string | null;
    }>(
      "SELECT attachment_url, attachment_name, attachment_mime FROM top_up_requests WHERE id = ?",
      [Number(params.id)]
    );
    if (!topUp?.attachment_url) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const buf = await readReceiptFile(topUp.attachment_url);
    return new NextResponse(buf as any, {
      headers: {
        "Content-Type": topUp.attachment_mime || "application/octet-stream",
        "Content-Disposition": contentDispositionHeader(
          topUp.attachment_name || "attachment"
        ),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return fail(err);
  }
}
