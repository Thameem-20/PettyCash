import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import {
  APPROVAL_PATH_LABELS,
  listApprovalPolicies,
  setBranchApprovalPolicies,
  type ApprovalPath,
  POLICY_SUBMITTER_ROLES,
} from "@/lib/approvalPolicy";
import { isSuspenseChargeScope, type SuspenseChargeScope } from "@/lib/chargeTypePolicy";
import { query } from "@/lib/db";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_PATHS = new Set(Object.keys(APPROVAL_PATH_LABELS) as ApprovalPath[]);

export async function GET() {
  try {
    await requireApiSession(["admin"]);
    const [policies, branches] = await Promise.all([
      listApprovalPolicies(),
      query<{ id: number; branch_name: string; branch_code: string }>(
        `SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name`
      ),
    ]);
    return ok({
      policies,
      branches,
      submitterRoles: POLICY_SUBMITTER_ROLES,
      pathLabels: APPROVAL_PATH_LABELS,
    });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireApiSession(["admin"]);
    const body = await req.json();
    const branchId = Number(body.branch_id);
    if (!Number.isFinite(branchId) || branchId <= 0) {
      throw new ApiError(422, "branch_id is required");
    }
    const raw = Array.isArray(body.policies) ? body.policies : [];
    const policies: {
      submitter_role: Role;
      approval_path: ApprovalPath;
      suspense_charge_scope: SuspenseChargeScope;
    }[] = [];
    for (const p of raw) {
      const submitter_role = String(p.submitter_role || "") as Role;
      const approval_path = String(p.approval_path || "") as ApprovalPath;
      const suspense_charge_scope = (p.suspense_charge_scope || "inherit") as SuspenseChargeScope;
      if (!POLICY_SUBMITTER_ROLES.includes(submitter_role)) {
        throw new ApiError(422, `Invalid submitter_role: ${submitter_role}`);
      }
      if (!VALID_PATHS.has(approval_path)) {
        throw new ApiError(422, `Invalid approval_path: ${approval_path}`);
      }
      if (!isSuspenseChargeScope(suspense_charge_scope)) {
        throw new ApiError(422, `Invalid suspense_charge_scope: ${suspense_charge_scope}`);
      }
      policies.push({ submitter_role, approval_path, suspense_charge_scope });
    }
    await setBranchApprovalPolicies(branchId, policies);
    return ok({ policies: await listApprovalPolicies(branchId) });
  } catch (err) {
    return fail(err);
  }
}
