import { requireRole } from "@/lib/session";
import { countRequestsWhere, getRequestsWhere } from "@/lib/requests";
import { PageHeader } from "@/components/page-chrome";
import RequestTable from "@/components/RequestTable";
import Tabs from "@/components/Tabs";
import Pagination from "@/components/Pagination";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";
import {
  supervisorActionExistsSql,
  supervisorApprovedExistsSql,
} from "@/lib/supervisorScope";
import {
  resolveBranchScope,
  branchScopeLabel,
  scopeIdsFrom,
  branchIdInSql,
  allowAllBranchesForRole,
} from "@/lib/accountsBranch";
import { getBranchListForSession } from "@/lib/accountsBranchServer";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "returned", label: "Returned" },
];

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: { tab?: string; page?: string; branch?: string };
}) {
  const session = await requireRole(["supervisor", "admin"]);
  const tab = searchParams.tab || "pending";
  const isAdmin = session.role === "admin" || session.primary_role === "admin";

  const branchList = await getBranchListForSession(session);
  const allowAll = allowAllBranchesForRole(session.primary_role || session.role);
  const scope =
    branchList.length > 0
      ? resolveBranchScope(
          resolveActiveBranchParam(session.preferred_branch_param, searchParams.branch),
          branchList,
          allowAll
        )
      : null;
  const scopeIds = scope ? scopeIdsFrom(scope) : [];
  const branchName = scope ? branchScopeLabel(scope, branchList) : "All Branches";
  const { sql: branchSql, params: branchParams } = scopeIds.length
    ? branchIdInSql(scopeIds)
    : { sql: "1=1", params: [] as number[] };
  const branchSqlR = branchSql.replace(/branch_id/g, "r.branch_id");

  const pendingStatuses = [EXACT_STATUS.PENDING_SUPERVISOR, SUSPENSE_STATUS.PENDING_SUPERVISOR];
  const phPending = pendingStatuses.map(() => "?").join(",");

  let where = "";
  let params: unknown[] = [];
  let order = "r.created_at DESC";
  let emptyMessage = "No requests found.";

  if (tab === "pending") {
    where = isAdmin
      ? `${branchSqlR} AND r.status IN (${phPending})`
      : `${branchSqlR} AND r.status IN (${phPending}) AND r.supervisor_id = ?`;
    params = isAdmin
      ? [...branchParams, ...pendingStatuses]
      : [...branchParams, ...pendingStatuses, session.id];
    order = "r.created_at ASC";
    emptyMessage = `No requests pending your approval in ${branchName}.`;
  } else if (tab === "approved") {
    where = isAdmin
      ? `${branchSqlR} AND r.approved_at IS NOT NULL AND r.status NOT IN (?, ?, ?, ?)`
      : `${branchSqlR} AND ${supervisorApprovedExistsSql("r")} AND r.status NOT IN (?, ?, ?, ?)`;
    params = isAdmin
      ? [
          ...branchParams,
          EXACT_STATUS.PENDING_SUPERVISOR,
          SUSPENSE_STATUS.PENDING_SUPERVISOR,
          EXACT_STATUS.REJECTED,
          SUSPENSE_STATUS.REJECTED,
        ]
      : [
          ...branchParams,
          session.id,
          EXACT_STATUS.PENDING_SUPERVISOR,
          SUSPENSE_STATUS.PENDING_SUPERVISOR,
          EXACT_STATUS.REJECTED,
          SUSPENSE_STATUS.REJECTED,
        ];
    order = "r.approved_at DESC";
    emptyMessage = `No approved requests in ${branchName} yet.`;
  } else if (tab === "rejected") {
    where = isAdmin
      ? `${branchSqlR} AND r.status IN (?, ?)`
      : `${branchSqlR} AND ${supervisorActionExistsSql(["reject"], "r")} AND r.status IN (?, ?)`;
    params = isAdmin
      ? [...branchParams, EXACT_STATUS.REJECTED, SUSPENSE_STATUS.REJECTED]
      : [...branchParams, session.id, "reject", EXACT_STATUS.REJECTED, SUSPENSE_STATUS.REJECTED];
    order = "r.updated_at DESC";
    emptyMessage = `No rejected requests in ${branchName}.`;
  } else if (tab === "returned") {
    where = isAdmin
      ? `${branchSqlR} AND r.status IN (?, ?)`
      : `${branchSqlR} AND ${supervisorActionExistsSql(["return"], "r")} AND r.status IN (?, ?)`;
    params = isAdmin
      ? [...branchParams, EXACT_STATUS.RETURNED, SUSPENSE_STATUS.RETURNED]
      : [...branchParams, session.id, "return", EXACT_STATUS.RETURNED, SUSPENSE_STATUS.RETURNED];
    order = "r.updated_at DESC";
    emptyMessage = `No requests returned for correction in ${branchName}.`;
  }

  const total = await countRequestsWhere(where, params);
  const meta = pageMeta(total, parsePage(searchParams.page));
  const rows = await getRequestsWhere(where, params, order, {
    limit: PAGE_SIZE,
    offset: pageOffset(meta.page),
  });

  const subtitles: Record<string, string> = {
    pending: `${branchName} — approve, reject or return requests for correction`,
    approved: `${branchName} — requests you approved`,
    rejected: `${branchName} — requests you rejected`,
    returned: `${branchName} — returned to the submitter for correction`,
  };

  return (
    <div>
      <PageHeader title="Approvals" subtitle={subtitles[tab] || subtitles.pending} />
      <Tabs tabs={TABS} current={tab} />
      <RequestTable
        rows={rows}
        showBranch={Boolean(scope?.all) || scopeIds.length > 1}
        emptyMessage={emptyMessage}
      />
      <Pagination meta={meta} />
    </div>
  );
}
