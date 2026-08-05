import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import {
  getRequestsWhere,
  countRequestsWhere,
  pendingPcpJvWhere,
} from "@/lib/requests";
import {
  resolveBranchScope,
  branchScopeLabel,
  scopeIdsFrom,
  allowAllBranchesForRole,
} from "@/lib/accountsBranch";
import { getBranchListForSession } from "@/lib/accountsBranchServer";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";
import { codingType, getBranchProfile, branchIdsWithCodingType } from "@/lib/branchProfile";
import { PageHeader } from "@/components/page-chrome";
import PcpJvTable, { type PcpJvTableRow } from "@/components/PcpJvTable";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function PcpJvPage({
  searchParams,
}: {
  searchParams: { branch?: string; page?: string };
}) {
  const session = await requireRole(["accounts", "accounts_supervisor", "admin"]);

  const branchList = await getBranchListForSession(session);

  if (branchList.length === 0) {
    return (
      <div>
        <PageHeader title="PCP and JV" />
        <p className="text-sm text-slate-500">No branches assigned to you. Contact admin.</p>
      </div>
    );
  }

  const allowAll = allowAllBranchesForRole(session.primary_role || session.role);
  const scope = resolveBranchScope(resolveActiveBranchParam(session.preferred_branch_param, searchParams.branch), branchList, allowAll);

  if (!scope.all) {
    const profile = await getBranchProfile(scope.branchId);
    if (codingType(profile) === "zybo") redirect("/accounts/zybo-vc");
    if (codingType(profile) !== "pcp_jv") {
      return (
        <div>
          <PageHeader title="PCP and JV" />
          <p className="text-sm text-slate-500">This branch does not use PCP / JV coding.</p>
        </div>
      );
    }
  }

  const scopeIds = scopeIdsFrom(scope);
  const pcpIds = await branchIdsWithCodingType("pcp_jv", scopeIds);
  const branchName = branchScopeLabel(scope, branchList);

  if (pcpIds.length === 0) {
    redirect("/accounts/zybo-vc");
  }

  const ph = pcpIds.map(() => "?").join(",");
  const where = `r.branch_id IN (${ph}) AND ${pendingPcpJvWhere("r")}`;
  const order = "DATEDIFF(CURDATE(), DATE(r.paid_at)) DESC, r.paid_at ASC";

  const total = await countRequestsWhere(where, pcpIds);
  const meta = pageMeta(total, parsePage(searchParams.page));
  const rows = await getRequestsWhere(where, pcpIds, order, {
    limit: PAGE_SIZE,
    offset: pageOffset(meta.page),
  });

  const todayRow = await queryOne<{ today: string }>("SELECT CURDATE() AS today");
  const todayMs = new Date(String(todayRow?.today).replace(" ", "T")).setHours(0, 0, 0, 0);

  const tableRows: PcpJvTableRow[] = rows.map((r) => {
    const paidMs = new Date(String(r.paid_at).replace(" ", "T")).setHours(0, 0, 0, 0);
    return {
      id: r.id,
      request_no: r.request_no,
      request_type: r.request_type,
      branch_name: r.branch_name,
      submitted_by_name: r.submitted_by_name,
      receiver_name: r.receiver_name,
      cash_receiver_label: r.cash_receiver_label,
      paid_at: r.paid_at!,
      paid_amount: Number(r.paid_amount),
      currency: r.currency,
      status: r.status,
      due_days: Math.max(0, Math.round((todayMs - paidMs) / 86_400_000)),
    };
  });

  return (
    <div>
      <PageHeader
        title="PCP and JV"
        subtitle={`${branchName} — enter PCP number and JV for paid requests`}
      />
      <PcpJvTable
        rows={tableRows}
        showBranch={scope.all || pcpIds.length > 1}
        emptyMessage="All paid requests have PCP and JV."
      />
      <Pagination meta={meta} />
    </div>
  );
}
