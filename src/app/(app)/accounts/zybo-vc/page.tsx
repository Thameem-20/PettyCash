import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import {
  getRequestsWhere,
  countRequestsWhere,
  accountsBranchIds,
  pendingZyboVoucherWhere,
  getJobNumbers,
} from "@/lib/requests";
import {
  resolveBranchScope,
  branchScopeLabel,
  scopeIdsFrom,
  allowAllBranchesForRole,
} from "@/lib/accountsBranch";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";
import { codingType, getBranchProfile, branchIdsWithCodingType } from "@/lib/branchProfile";
import { resolveZyboBranchSegment } from "@/lib/zyboVoucherServer";
import { PageHeader } from "@/components/page-chrome";
import ZyboVcTable, { type ZyboVcTableRow } from "@/components/ZyboVcTable";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function ZyboVcPage({
  searchParams,
}: {
  searchParams: { branch?: string; page?: string };
}) {
  const session = await requireRole(["accounts", "accounts_supervisor", "admin"]);

  let branchList: { id: number; branch_name: string; branch_code: string }[];
  if (session.role === "accounts" || session.primary_role === "accounts") {
    const ids = await accountsBranchIds(session.id);
    branchList = ids.length
      ? await query(
          "SELECT id, branch_name, branch_code FROM branches WHERE id IN (?) ORDER BY branch_name",
          [ids]
        )
      : [];
  } else {
    branchList = await query(
      "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
    );
  }

  if (branchList.length === 0) {
    return (
      <div>
        <PageHeader title="Zybo VC" />
        <p className="text-sm text-slate-500">No branches assigned to you. Contact admin.</p>
      </div>
    );
  }

  const allowAll = allowAllBranchesForRole(session.primary_role || session.role);
  const scope = resolveBranchScope(resolveActiveBranchParam(session.preferred_branch_param, searchParams.branch), branchList, allowAll);

  if (!scope.all) {
    const profile = await getBranchProfile(scope.branchId);
    if (codingType(profile) === "pcp_jv") redirect("/accounts/pcp-jv");
    if (codingType(profile) === "none") {
      return (
        <div>
          <PageHeader title="Zybo VC" />
          <p className="text-sm text-slate-500">This branch does not use voucher coding.</p>
        </div>
      );
    }
  }

  const scopeIds = scopeIdsFrom(scope);
  const zyboIds = await branchIdsWithCodingType("zybo", scopeIds);
  const branchName = branchScopeLabel(scope, branchList);

  if (zyboIds.length === 0) {
    return (
      <div>
        <PageHeader title="Zybo VC" subtitle={branchName} />
        <p className="text-sm text-slate-500">No Zybo-coding branches in this scope.</p>
      </div>
    );
  }

  const ph = zyboIds.map(() => "?").join(",");
  const where = `r.branch_id IN (${ph}) AND ${pendingZyboVoucherWhere("r")}`;
  const order = "DATEDIFF(CURDATE(), DATE(r.paid_at)) DESC, r.paid_at ASC";
  const total = await countRequestsWhere(where, zyboIds);
  const meta = pageMeta(total, parsePage(searchParams.page));
  const rows = await getRequestsWhere(where, zyboIds, order, {
    limit: PAGE_SIZE,
    offset: pageOffset(meta.page),
  });

  const todayRow = await queryOne<{ today: string }>("SELECT CURDATE() AS today");
  const todayMs = new Date(String(todayRow?.today).replace(" ", "T")).setHours(0, 0, 0, 0);

  const tableRows: ZyboVcTableRow[] = await Promise.all(
    rows.map(async (r) => {
      const jobNumbers = await getJobNumbers(r.id);
      const branchSegment = await resolveZyboBranchSegment(
        r.branch_id,
        jobNumbers[0] ?? r.job_number
      );
      const paidMs = new Date(String(r.paid_at).replace(" ", "T")).setHours(0, 0, 0, 0);

      return {
        id: r.id,
        request_no: r.request_no,
        request_type: r.request_type,
        category_name: r.category_name,
        branch_name: r.branch_name,
        submitted_by_name: r.submitted_by_name,
        receiver_name: r.receiver_name,
        cash_receiver_label: r.cash_receiver_label,
        paid_at: r.paid_at!,
        paid_amount: Number(r.paid_amount),
        currency: r.currency,
        status: r.status,
        branchSegment,
        due_days: Math.max(0, Math.round((todayMs - paidMs) / 86_400_000)),
      };
    })
  );

  return (
    <div>
      <PageHeader
        title="Zybo VC"
        subtitle={`${branchName} — Zybo VC for petty cash paid and closed suspense (not open advances)`}
      />
      <ZyboVcTable
        rows={tableRows}
        showBranch={scope.all || zyboIds.length > 1}
        emptyMessage="No pending Zybo vouchers for petty cash paid or closed suspense."
      />
      <Pagination meta={meta} />
    </div>
  );
}
