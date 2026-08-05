import { Suspense } from "react";
import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import {
  getRequestsWhere,
  countRequestsWhere,
  isPaymentReceiptDownloadReady,
} from "@/lib/requests";
import { getBranchListForSession } from "@/lib/accountsBranchServer";
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
import PaymentRecordsFilters from "@/components/PaymentRecordsFilters";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

function isYmd(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default async function PaymentRecordsPage({
  searchParams,
}: {
  searchParams: {
    branch?: string;
    page?: string;
    q?: string;
    user?: string;
    type?: string;
    from?: string;
    to?: string;
  };
}) {
  const session = await requireRole(["accounts", "accounts_supervisor", "admin"]);

  const branchList = await getBranchListForSession(session);

  if (branchList.length === 0) {
    return (
      <div>
        <PageHeader title="Payment Records" />
        <p className="text-sm text-slate-500">No branches assigned to you. Contact admin.</p>
      </div>
    );
  }

  const allowAll = allowAllBranchesForRole(session.role);
  const scope = resolveBranchScope(
    resolveActiveBranchParam(session.preferred_branch_param, searchParams.branch),
    branchList,
    allowAll
  );
  const scopeIds = scopeIdsFrom(scope);
  const branchName = branchScopeLabel(scope, branchList);
  const { sql: branchSql, params: branchParams } = branchIdInSql(scopeIds);
  const branchSqlR = branchSql.replace(/branch_id/g, "r.branch_id");

  const submitters = await query<{ id: number; name: string }>(
    `SELECT DISTINCT u.id, u.name
       FROM petty_cash_requests r
       JOIN users u ON u.id = r.submitted_by_user_id
      WHERE ${branchSqlR}
        AND r.paid_at IS NOT NULL AND r.paid_amount IS NOT NULL
      ORDER BY u.name`,
    branchParams
  );

  const q = (searchParams.q || "").trim();
  const typeParam = searchParams.type === "exact" || searchParams.type === "suspense"
    ? searchParams.type
    : "";
  const userParam = searchParams.user?.trim();
  const userId = userParam && /^\d+$/.test(userParam) ? Number(userParam) : null;
  const validUserId =
    userId != null && submitters.some((u) => u.id === userId) ? userId : null;
  const from = isYmd(searchParams.from) ? searchParams.from : "";
  const to = isYmd(searchParams.to) ? searchParams.to : "";

  const whereParts = [
    branchSqlR,
    "r.paid_at IS NOT NULL",
    "r.paid_amount IS NOT NULL",
  ];
  const params: unknown[] = [...branchParams];

  if (typeParam) {
    whereParts.push("r.request_type = ?");
    params.push(typeParam);
  }
  if (validUserId != null) {
    whereParts.push("r.submitted_by_user_id = ?");
    params.push(validUserId);
  }
  if (from) {
    whereParts.push("DATE(r.paid_at) >= ?");
    params.push(from);
  }
  if (to) {
    whereParts.push("DATE(r.paid_at) <= ?");
    params.push(to);
  }
  if (q) {
    const like = `%${q}%`;
    whereParts.push(
      `(r.request_no LIKE ? OR COALESCE(r.closed_request_no, '') LIKE ?
        OR COALESCE(r.description, '') LIKE ? OR COALESCE(r.job_number, '') LIKE ?
        OR su.name LIKE ? OR COALESCE(ru.name, '') LIKE ?
        OR COALESCE(r.cash_receiver_label, '') LIKE ?
        OR COALESCE(r.zybo_voucher_code, '') LIKE ?
        OR COALESCE(r.pcp_number, '') LIKE ? OR COALESCE(r.jv_number, '') LIKE ?)`
    );
    params.push(like, like, like, like, like, like, like, like, like, like);
  }

  const where = whereParts.join(" AND ");
  const total = await countRequestsWhere(where, params);
  const meta = pageMeta(total, parsePage(searchParams.page));
  const rows = await getRequestsWhere(where, params, "r.paid_at DESC", {
    limit: PAGE_SIZE,
    offset: pageOffset(meta.page),
  });

  const hasFilters = Boolean(q || validUserId || typeParam || from || to);
  const emptyMessage = hasFilters
    ? "No payment records match your search or filters."
    : "No payment records for this branch yet.";

  return (
    <div>
      <PageHeader
        title="Payment Records"
        subtitle={`${branchName} — all paid and issued requests`}
      />
      <Suspense fallback={<div className="mb-4 h-28 animate-pulse rounded-lg bg-slate-100" />}>
        <PaymentRecordsFilters
          users={JSON.parse(JSON.stringify(submitters))}
          current={{
            q,
            userId: validUserId,
            type: typeParam,
            from,
            to,
          }}
        />
      </Suspense>
      <RequestTable
        rows={JSON.parse(JSON.stringify(rows))}
        showBranch={scope.all}
        dateField="paid_at"
        dateLabel="Paid On"
        usePaidAmount
        showPaymentReceiptDownload
        canDownloadPaymentReceipt={isPaymentReceiptDownloadReady}
        emptyMessage={emptyMessage}
      />
      <Pagination meta={meta} />
    </div>
  );
}
