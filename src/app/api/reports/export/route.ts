import { NextRequest } from "next/server";
import { fail, requireApiSession } from "@/lib/api";
import { runReport } from "@/lib/reports";
import { toExcelBuffer } from "@/lib/reportExcel";
import { resolveReportBranch } from "@/lib/accountsBranch";
import { getBranchListForSession } from "@/lib/accountsBranchServer";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";
import { resolveReportDateRange } from "@/lib/reportDateRange";
import { effectiveReportBranchId, reportUsesDateFilter, resolveRequestListTab, resolveReportMessenger } from "@/lib/reportFilters";
import { getReportMessengers } from "@/lib/reportMessengers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireApiSession(["accounts", "accounts_supervisor", "treasury", "admin"]);
    const sp = req.nextUrl.searchParams;
    const type = sp.get("type") || "request_list";
    const dateRange = resolveReportDateRange(
      sp.get("period") ?? undefined,
      sp.get("from") ?? undefined,
      sp.get("to") ?? undefined,
      type
    );

    const branches = await getBranchListForSession(session);
    const messengers = await getReportMessengers();
    const allowAllBranches = session.role !== "accounts";
    const branchId = resolveReportBranch(
      resolveActiveBranchParam(session.preferred_branch_param, sp.get("branch")),
      branches,
      allowAllBranches
    );
    const useDates = reportUsesDateFilter(type);

    const detailed = type === "request_list" && sp.get("detailed") === "1";

    const result = await runReport(type, {
      period: useDates ? dateRange.period : undefined,
      from: useDates && dateRange.period === "custom" ? dateRange.from : undefined,
      to: useDates && dateRange.period === "custom" ? dateRange.to : undefined,
      branchId: effectiveReportBranchId(type, branchId),
      messengerUserId: resolveReportMessenger(sp.get("messenger") ?? undefined, messengers),
      detailed,
    });

    let exportResult = result;
    if (type === "request_list" && result.sections) {
      const tab = resolveRequestListTab(sp.get("tab") ?? undefined);
      exportResult = {
        ...result,
        sections: result.sections.filter((s) => s.key === tab),
      };
    }

    const buffer = toExcelBuffer(exportResult, { detailed });
    const suffix = type === "request_list" ? `_${resolveRequestListTab(sp.get("tab") ?? undefined)}` : "";
    const detailSuffix = detailed ? "_detailed" : "";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${type}${suffix}${detailSuffix}_report.xlsx"`,
      },
    });
  } catch (err) {
    return fail(err);
  }
}
