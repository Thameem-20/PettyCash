import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { accountsBranchIds } from "@/lib/requests";
import {
  resolveBranchScope,
  branchScopeLabel,
  branchScopeQuery,
  scopeIdsFrom,
  allowAllBranchesForRole,
  resolveAccountsBranch,
} from "@/lib/accountsBranch";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";
import { getTopUpsWhere, countTopUpsWhere } from "@/lib/topup";
import { PageHeader } from "@/components/page-chrome";
import TopUpForm from "./TopUpForm";
import TopUpList from "@/components/TopUpList";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE, pageMeta, pageOffset, parsePage } from "@/lib/pagination";
import type { BankAccount } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AccountsTopUpPage({
  searchParams,
}: {
  searchParams: { branch?: string; page?: string };
}) {
  const session = await requireRole(["accounts", "accounts_supervisor", "admin"]);

  let branches: { id: number; branch_name: string; branch_code: string }[];
  if (session.role === "accounts") {
    const ids = await accountsBranchIds(session.id);
    branches = ids.length
      ? await query(
          "SELECT id, branch_name, branch_code FROM branches WHERE id IN (?) ORDER BY branch_name",
          [ids]
        )
      : [];
  } else {
    branches = await query(
      "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
    );
  }

  const banks = await query<Pick<BankAccount, "id" | "branch_id" | "bank_name" | "last_four">>(
    "SELECT id, branch_id, bank_name, last_four FROM bank_accounts WHERE is_active = 1 ORDER BY bank_name, last_four"
  );

  if (branches.length === 0) {
    return (
      <div>
        <PageHeader backHref="/accounts" title="Petty Cash Top-Up" />
        <p className="text-sm text-slate-500">No branches available.</p>
      </div>
    );
  }

  const allowAll = allowAllBranchesForRole(session.role);
  const scope = resolveBranchScope(resolveActiveBranchParam(session.preferred_branch_param, searchParams.branch), branches, allowAll);
  const scopeIds = scopeIdsFrom(scope);
  const branchName = branchScopeLabel(scope, branches);
  const branchQ = branchScopeQuery(scope);
  const formBranchId = scope.all ? resolveAccountsBranch(undefined, branches) : scope.branchId;

  const where = `t.branch_id IN (${scopeIds.map(() => "?").join(",")})`;
  const total = await countTopUpsWhere(where, scopeIds);
  const meta = pageMeta(total, parsePage(searchParams.page));
  const rows = await getTopUpsWhere(where, scopeIds, "t.created_at DESC", {
    limit: PAGE_SIZE,
    offset: pageOffset(meta.page),
  });

  return (
    <div>
      <PageHeader
        backHref={`/accounts?${branchQ}`}
        title="Petty Cash Top-Up"
        subtitle={`${branchName} — request and receive cash for your branch cashbox`}
        actions={
          <TopUpForm
            branches={branches}
            branchId={formBranchId}
            banks={JSON.parse(JSON.stringify(banks))}
          />
        }
      />
      <TopUpList rows={rows} ctx="accounts" />
      <Pagination meta={meta} />
    </div>
  );
}
