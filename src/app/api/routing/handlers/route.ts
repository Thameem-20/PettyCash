import { NextRequest } from "next/server";
import { fail, ok, requireApiSession } from "@/lib/api";
import { getBranchHandlers } from "@/lib/routing";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireApiSession();
    const branchId = Number(req.nextUrl.searchParams.get("branch_id") || 0);
    if (!branchId) return ok({ handlers: [] });
    const info = await getBranchHandlers(branchId);
    return ok({
      branch: info ? { id: info.branch.id, name: info.branch.branch_name } : null,
      handlers: info?.handlers || [],
    });
  } catch (err) {
    return fail(err);
  }
}
