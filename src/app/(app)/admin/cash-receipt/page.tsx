import { Suspense } from "react";
import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import {
  resolveBranchScope,
  branchScopeLabel,
  scopeIdsFrom,
  type AccountsBranch,
} from "@/lib/accountsBranch";
import { getBranchListForSession } from "@/lib/accountsBranchServer";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";
import { countRequestsWhere, getRequestsWhere } from "@/lib/requests";
import { PageHeader } from "@/components/page-chrome";
import Pagination from "@/components/Pagination";
import CashReceiptFilters from "./CashReceiptFilters";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";
import { syncAwaitingRoleSupervisorReceivers } from "@/lib/supervisorCashReceiver";
import CashReceiptQueue from "./CashReceiptQueue";

export const dynamic = "force-dynamic";

const PENDING_STATUSES = [
  EXACT_STATUS.AWAITING_RECEIVER,
  SUSPENSE_STATUS.AWAITING_CASH_RECEIPT,
];

export default async function AdminCashReceiptPage({
  searchParams,
}: {
  searchParams: { branch?: string; page?: string; q?: string; user?: string };
}) {
  const session = await requireRole(["admin"]);
  await syncAwaitingRoleSupervisorReceivers();

  const branches = await query<AccountsBranch>(
    "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
  );

  if (branches.length === 0) {
    return (
      <div>
        <PageHeader title="Cash Receipt" subtitle="Confirm pending cash receipts by branch" />
        <p className="text-sm text-slate-500">No branches configured.</p>
      </div>
    );
  }

  const branchList = await getBranchListForSession(session);
  const pickList = branchList.length > 0 ? branchList : branches;
  const scope = resolveBranchScope(
    resolveActiveBranchParam(session.preferred_branch_param, searchParams.branch),
    pickList,
    true
  );
  const scopeIds = scopeIdsFrom(scope);
  const branchName = branchScopeLabel(scope, pickList);

  const ph = PENDING_STATUSES.map(() => "?").join(",");
  const branchPh = scopeIds.map(() => "?").join(",");

  const receivers = await query<{ id: number; name: string }>(
    `SELECT DISTINCT u.id, u.name
       FROM petty_cash_requests r
       LEFT JOIN users u ON u.id = r.cash_receiver_user_id
      WHERE r.branch_id IN (${branchPh})
        AND r.status IN (${ph})
        AND u.id IS NOT NULL
      ORDER BY u.name`,
    [...scopeIds, ...PENDING_STATUSES]
  );

  const q = (searchParams.q || "").trim();
  const userParam = searchParams.user?.trim();
  const userId = userParam && /^\d+$/.test(userParam) ? Number(userParam) : null;
  const validUserId =
    userId != null && receivers.some((u) => u.id === userId) ? userId : null;

  const whereParts = [`r.branch_id IN (${branchPh})`, `r.status IN (${ph})`];
  const params: unknown[] = [...scopeIds, ...PENDING_STATUSES];

  if (validUserId != null) {
    whereParts.push("r.cash_receiver_user_id = ?");
    params.push(validUserId);
  }

  if (q) {
    const like = `%${q}%`;
    whereParts.push(
      `(r.request_no LIKE ? OR r.description LIKE ? OR su.name LIKE ? OR COALESCE(ru.name, r.cash_receiver_label, '') LIKE ?)`
    );
    params.push(like, like, like, like);
  }

  const where = whereParts.join(" AND ");
  const total = await countRequestsWhere(where, params);
  const meta = pageMeta(total, parsePage(searchParams.page));
  const rows = await getRequestsWhere(where, params, "r.paid_at ASC, r.created_at ASC", {
    limit: PAGE_SIZE,
    offset: pageOffset(meta.page),
  });

  const emptyMessage =
    q || validUserId
      ? "No pending cash receipts match your search or filter."
      : `No requests awaiting cash receipt confirmation in ${branchName}.`;

  return (
    <div>
      <PageHeader
        title="Cash Receipt"
        subtitle={`Pending receiver confirmation · ${branchName}. Confirm on behalf of the assigned messenger with remarks.`}
      />
      <Suspense fallback={<div className="mb-4 h-16 animate-pulse rounded bg-slate-100" />}>
        <CashReceiptFilters
          receivers={JSON.parse(JSON.stringify(receivers))}
          currentReceiverId={validUserId}
          currentQ={q}
        />
      </Suspense>
      <CashReceiptQueue
        rows={JSON.parse(JSON.stringify(rows))}
        emptyMessage={emptyMessage}
      />
      <Pagination meta={meta} />
    </div>
  );
}
