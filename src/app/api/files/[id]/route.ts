import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { requireApiSession, fail } from "@/lib/api";
import { contentDispositionHeader, readReceiptFile } from "@/lib/files";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireApiSession();
    const receipt = await queryOne<{ file_url: string; file_name: string; mime_type: string | null }>(
      "SELECT file_url, file_name, mime_type FROM receipts WHERE id = ?",
      [Number(params.id)]
    );
    if (!receipt) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const buf = await readReceiptFile(receipt.file_url);
    const download = req.nextUrl.searchParams.get("download") === "1";

    return new NextResponse(buf as any, {
      headers: {
        "Content-Type": receipt.mime_type || "application/octet-stream",
        "Content-Disposition": contentDispositionHeader(
          receipt.file_name || "receipt.pdf",
          download
        ),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return fail(err);
  }
}
