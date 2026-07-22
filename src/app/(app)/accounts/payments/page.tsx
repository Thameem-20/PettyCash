import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import {
  getRequestsWhere,
  countRequestsWhere,
  accountsBranchIds,
  isPaymentReceiptDownloadReady,
} from "@/lib/requests";
import {
  resolveBranchScope,
  branchScopeLabel,
  scopeIdsFrom,
  allowAllBranchesForRole,
  branchIdInSql,
} from "@/lib/accountsBranch";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";
import { PageHeader } from "@/components/page-chrome";
import RequestTable from "@/components/RequestTable";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function PaymentRecordsPage({
  searchParams,
}: {
  searchParams: { branch?: string; page?: string };
}) {
  const session = await requireRole(["accounts", "accounts_supervisor", "admin"]);

  let branchList: { id: number; branch_name: string; branch_code: string }[];
  if (session.role === "accounts") {
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
        <PageHeader title="Payment Records" />
        <p className="text-sm text-slate-500">No branches assigned to you. Contact admin.</p>
      </div>
    );
  }

  const allowAll = allowAllBranchesForRole(session.role);
  const scope = resolveBranchScope(resolveActiveBranchParam(session.preferred_branch_param, searchParams.branch), branchList, allowAll);
  const scopeIds = scopeIdsFrom(scope);
  const branchName = branchScopeLabel(scope, branchList);
  const { sql: branchSql, params: branchParams } = branchIdInSql(scopeIds);
  const branchSqlR = branchSql.replace(/branch_id/g, "r.branch_id");
  const where = `${branchSqlR} AND r.paid_at IS NOT NULL AND r.paid_amount IS NOT NULL`;

  const total = await countRequestsWhere(where, branchParams);
  const meta = pageMeta(total, parsePage(searchParams.page));
  const rows = await getRequestsWhere(where, branchParams, "r.paid_at DESC", {
    limit: PAGE_SIZE,
    offset: pageOffset(meta.page),
  });

  return (
    <div>
      <PageHeader
        title="Payment Records"
        subtitle={`${branchName} — all paid and issued requests`}
      />
      <RequestTable
        rows={rows}
        showBranch={scope.all}
        dateField="paid_at"
        dateLabel="Paid On"
        usePaidAmount
        showPaymentReceiptDownload
        canDownloadPaymentReceipt={isPaymentReceiptDownloadReady}
        emptyMessage="No payment records for this branch yet."
      />
      <Pagination meta={meta} />
    </div>
  );
}
