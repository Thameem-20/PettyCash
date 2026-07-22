import { NextRequest } from "next/server";
import { fail, ok, requireApiSession } from "@/lib/api";
import { resolveBranchFromJobNumber, getBranchHandlers } from "@/lib/routing";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireApiSession();
    const jobNumber = req.nextUrl.searchParams.get("job_number") || "";
    const resolution = await resolveBranchFromJobNumber(jobNumber);
    if (!resolution.ok || !resolution.branch) {
      return ok({ resolved: false, error: resolution.error, jobCode: resolution.jobCode });
    }
    const handlers = await getBranchHandlers(resolution.branch.id);
    return ok({
      resolved: true,
      branch: { id: resolution.branch.id, name: resolution.branch.branch_name },
      jobCode: resolution.jobCode,
      handlers: handlers?.handlers || [],
    });
  } catch (err) {
    return fail(err);
  }
}
