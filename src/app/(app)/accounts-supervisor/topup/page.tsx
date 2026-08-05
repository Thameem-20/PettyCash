import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import {
  resolveBranchScope,
  branchScopeLabel,
  branchScopeQuery,
  scopeIdsFrom,
} from "@/lib/accountsBranch";
import { getBranchListForSession } from "@/lib/accountsBranchServer";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";
import { getTopUpsWhere, countTopUpsWhere } from "@/lib/topup";
import { PageHeader } from "@/components/page-chrome";
import TopUpList from "@/components/TopUpList";
import Pagination from "@/components/Pagination";
import { TOPUP_STATUS } from "@/lib/status";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function AccSupTopUpPage({
  searchParams,
}: {
  searchParams: { branch?: string; page?: string };
}) {
  const session = await requireRole(["accounts_supervisor", "admin"]);

  const branches = await getBranchListForSession(session);

  if (branches.length === 0) {
    return (
      <div>
        <PageHeader backHref="/accounts-supervisor" title="Top-Up Approvals" />
        <p className="text-sm text-slate-500">No branches available.</p>
      </div>
    );
  }

  const scope = resolveBranchScope(resolveActiveBranchParam(session.preferred_branch_param, searchParams.branch), branches, true);
  const scopeIds = scopeIdsFrom(scope);
  const branchName = branchScopeLabel(scope, branches);
  const branchQ = branchScopeQuery(scope);
  const branchWhere = `t.branch_id IN (${scopeIds.map(() => "?").join(",")})`;

  const pending = await getTopUpsWhere(
    `${branchWhere} AND t.status = ?`,
    [...scopeIds, TOPUP_STATUS.PENDING_ACC_SUP]
  );

  const historyWhere = `${branchWhere} AND t.status != ?`;
  const historyParams = [...scopeIds, TOPUP_STATUS.PENDING_ACC_SUP];
  const historyTotal = await countTopUpsWhere(historyWhere, historyParams);
  const historyMeta = pageMeta(historyTotal, parsePage(searchParams.page));
  const history = await getTopUpsWhere(historyWhere, historyParams, "t.created_at DESC", {
    limit: PAGE_SIZE,
    offset: pageOffset(historyMeta.page),
  });

  return (
    <div>
      <PageHeader
        backHref={`/accounts-supervisor?${branchQ}`}
        title="Top-Up Approvals"
        subtitle={`${branchName} — approve branch top-up requests before Treasury`}
      />
      <h2 className="mb-2 text-sm font-semibold text-slate-600">Pending your approval</h2>
      <TopUpList rows={pending} ctx="accsup" />
      <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-600">All top-up requests</h2>
      <TopUpList rows={history} ctx="accsup" />
      <Pagination meta={historyMeta} />
    </div>
  );
}
