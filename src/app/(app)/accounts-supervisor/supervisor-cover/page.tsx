import { Suspense } from "react";
import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import {
  resolveBranchScope,
  branchScopeLabel,
  scopeIdsFrom,
} from "@/lib/accountsBranch";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";
import { countRequestsWhere, getRequestsWhere } from "@/lib/requests";
import { PageHeader } from "@/components/page-chrome";
import RequestTable from "@/components/RequestTable";
import Pagination from "@/components/Pagination";
import SupervisorCoverFilters from "@/components/SupervisorCoverFilters";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function SupervisorCoverPage({
  searchParams,
}: {
  searchParams: { branch?: string; page?: string; q?: string; user?: string };
}) {
  const session = await requireRole(["accounts_supervisor", "admin"]);

  const branches = await query<{ id: number; branch_name: string; branch_code: string }>(
    "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
  );

  if (branches.length === 0) {
    return (
      <div>
        <PageHeader backHref="/accounts-supervisor" title="Supervisor Cover" />
        <p className="text-sm text-slate-500">No branches available.</p>
      </div>
    );
  }

  const scope = resolveBranchScope(
    resolveActiveBranchParam(session.preferred_branch_param, searchParams.branch),
    branches,
    true
  );
  const scopeIds = scopeIdsFrom(scope);
  const branchName = branchScopeLabel(scope, branches);

  const pendingStatuses = [EXACT_STATUS.PENDING_SUPERVISOR, SUSPENSE_STATUS.PENDING_SUPERVISOR];
  const ph = pendingStatuses.map(() => "?").join(",");
  const branchPh = scopeIds.map(() => "?").join(",");

  const submitters = await query<{ id: number; name: string }>(
    `SELECT DISTINCT u.id, u.name
       FROM petty_cash_requests r
       JOIN users u ON u.id = r.submitted_by_user_id
      WHERE r.branch_id IN (${branchPh}) AND r.status IN (${ph})
      ORDER BY u.name`,
    [...scopeIds, ...pendingStatuses]
  );

  const q = (searchParams.q || "").trim();
  const userParam = searchParams.user?.trim();
  const userId = userParam && /^\d+$/.test(userParam) ? Number(userParam) : null;
  const validUserId =
    userId != null && submitters.some((u) => u.id === userId) ? userId : null;

  const whereParts = [`r.branch_id IN (${branchPh})`, `r.status IN (${ph})`];
  const params: unknown[] = [...scopeIds, ...pendingStatuses];

  if (validUserId != null) {
    whereParts.push("r.submitted_by_user_id = ?");
    params.push(validUserId);
  }

  if (q) {
    const like = `%${q}%`;
    whereParts.push(
      `(r.request_no LIKE ? OR r.description LIKE ? OR su.name LIKE ? OR COALESCE(sup.name, '') LIKE ?)`
    );
    params.push(like, like, like, like);
  }

  const where = whereParts.join(" AND ");
  const total = await countRequestsWhere(where, params);
  const meta = pageMeta(total, parsePage(searchParams.page));
  const rows = await getRequestsWhere(where, params, "r.created_at ASC", {
    limit: PAGE_SIZE,
    offset: pageOffset(meta.page),
  });

  const emptyMessage =
    q || validUserId
      ? "No pending supervisor approvals match your search or filter."
      : "No requests are waiting on supervisor approval.";

  return (
    <div className="-mx-1 rounded-xl border border-amber-200 bg-gradient-to-b from-amber-50 via-amber-50/40 to-white px-3 py-4 sm:mx-0 sm:px-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex items-center rounded-md bg-amber-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
          Cover mode
        </span>
        <span className="text-xs font-medium text-amber-800">
          Act on behalf of absent supervisors
        </span>
      </div>
      <PageHeader
        backHref="/accounts-supervisor"
        title="Supervisor Cover"
        subtitle={`Requests waiting on supervisor approval${
          branchName ? ` · ${branchName}` : ""
        }. Approve, return, or reject when the assigned supervisor is unavailable.`}
      />
      <Suspense
        fallback={<div className="mb-4 h-16 animate-pulse rounded bg-amber-100/60" />}
      >
        <SupervisorCoverFilters
          users={JSON.parse(JSON.stringify(submitters))}
          currentUserId={validUserId}
          currentQ={q}
        />
      </Suspense>
      <RequestTable
        rows={JSON.parse(JSON.stringify(rows))}
        emptyMessage={emptyMessage}
      />
      <Pagination meta={meta} />
    </div>
  );
}
