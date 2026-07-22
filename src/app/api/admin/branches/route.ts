import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { execute } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ensureBranchProfile } from "@/lib/branchProfile";
import { setBranchApprovalPolicies, defaultApprovalPath, POLICY_SUBMITTER_ROLES } from "@/lib/approvalPolicy";

export async function POST(req: NextRequest) {
  try {
    const session = await requireApiSession(["admin"]);
    const { id, branch_name, branch_code, opening_balance, currency, is_active } = await req.json();
    if (!branch_name || !branch_code) throw new ApiError(400, "Name and code are required");

    if (id) {
      await execute(
        "UPDATE branches SET branch_name=?, branch_code=?, currency=?, is_active=? WHERE id=?",
        [branch_name, branch_code, currency || "AED", is_active ? 1 : 0, id]
      );
      await ensureBranchProfile(Number(id));
      await audit({ userId: session.id, action: "update_branch", entityType: "branch", entityId: id });
    } else {
      const res = await execute(
        "INSERT INTO branches (branch_name, branch_code, currency, opening_balance, current_cash_balance) VALUES (?,?,?,?,?)",
        [branch_name, branch_code, currency || "AED", Number(opening_balance || 0), Number(opening_balance || 0)]
      );
      const newId = res.insertId;
      await ensureBranchProfile(newId);
      await setBranchApprovalPolicies(
        newId,
        POLICY_SUBMITTER_ROLES.map((role) => ({
          submitter_role: role,
          approval_path: defaultApprovalPath(role),
        }))
      );
      await audit({ userId: session.id, action: "create_branch", entityType: "branch", entityId: newId });
    }
    return ok();
  } catch (err) {
    return fail(err);
  }
}
