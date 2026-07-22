export type AccountsBranch = { id: number; branch_name: string; branch_code?: string };

export type BranchScope =
  | { all: true; branchIds: number[] }
  | { all: false; branchId: number };

/** Supervisor/admin can view aggregated data across branches. */
export function allowAllBranchesForRole(role: string): boolean {
  return role === "accounts_supervisor" || role === "admin";
}

/** Resolve the active branch for accounts pages (single-branch view). Defaults to Dubai. */
export function resolveAccountsBranch(
  branchParam: string | undefined,
  branchList: AccountsBranch[]
): number {
  if (branchList.length === 0) throw new Error("No branches available");
  const allowed = new Set(branchList.map((b) => b.id));
  if (branchParam && branchParam !== "all") {
    const id = Number(branchParam);
    if (allowed.has(id)) return id;
  }
  const dubai = branchList.find((b) => b.branch_name === "Dubai" || b.branch_code === "DXB");
  if (dubai) return dubai.id;
  return branchList[0].id;
}

/** Current top-bar selection (branch id or all). */
export function resolveTopBarBranch(
  branchParam: string | undefined,
  branchList: AccountsBranch[],
  allowAll: boolean
): number | "all" {
  if (allowAll && branchParam === "all") return "all";
  return resolveAccountsBranch(branchParam, branchList);
}

/** Resolve branch filter for pages — single branch or all accessible branches. */
export function resolveBranchScope(
  branchParam: string | undefined,
  branchList: AccountsBranch[],
  allowAll: boolean
): BranchScope {
  if (allowAll && branchParam === "all") {
    return { all: true, branchIds: branchList.map((b) => b.id) };
  }
  return { all: false, branchId: resolveAccountsBranch(branchParam, branchList) };
}

export function scopeIdsFrom(scope: BranchScope): number[] {
  return scope.all ? scope.branchIds : [scope.branchId];
}

export function branchScopeLabel(scope: BranchScope, branchList: AccountsBranch[]): string {
  if (scope.all) return "All Branches";
  return branchList.find((b) => b.id === scope.branchId)?.branch_name ?? "Branch";
}

export function branchScopeQuery(scope: BranchScope): string {
  return scope.all ? "branch=all" : `branch=${scope.branchId}`;
}

export function branchIdInSql(branchIds: number[]): { sql: string; params: number[] } {
  if (branchIds.length === 1) return { sql: "branch_id = ?", params: branchIds };
  return { sql: `branch_id IN (${branchIds.map(() => "?").join(",")})`, params: branchIds };
}

/** Resolve branch for reports. Supervisor/admin default to all; accounts default to Dubai. */
export function resolveReportBranch(
  branchParam: string | undefined,
  branchList: AccountsBranch[],
  allowAll = true
): number | null {
  if (branchList.length === 0) return null;
  if (allowAll) {
    if (!branchParam || branchParam === "all") return null;
    const id = Number(branchParam);
    return branchList.some((b) => b.id === id) ? id : null;
  }
  return resolveAccountsBranch(branchParam, branchList);
}
