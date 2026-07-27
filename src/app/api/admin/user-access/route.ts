import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { execute } from "@/lib/db";
import { audit } from "@/lib/audit";

type AssignmentKind = "accounts" | "accounts_supervisor" | "supervisor" | "treasury";

/**
 * Add or remove branch assignments for accounts, accounts supervisors, supervisors,
 * or treasury (keeps Control Panel user_branch_roles in sync).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireApiSession(["admin"]);
    const { user_id, branch_id, action, kind } = await req.json();
    if (!user_id || !branch_id) throw new ApiError(400, "User and branch required");

    const assignment: AssignmentKind =
      kind === "supervisor"
        ? "supervisor"
        : kind === "accounts_supervisor"
          ? "accounts_supervisor"
          : kind === "treasury"
            ? "treasury"
            : "accounts";

    if (assignment === "accounts" || assignment === "accounts_supervisor") {
      const membershipRole = assignment === "accounts_supervisor" ? "accounts_supervisor" : "accounts";
      if (action === "remove") {
        await execute("DELETE FROM user_branch_access WHERE user_id=? AND branch_id=?", [
          user_id,
          branch_id,
        ]);
        await execute(
          `DELETE FROM user_branch_roles
            WHERE user_id=? AND branch_id=? AND role IN ('accounts','accounts_supervisor')`,
          [user_id, branch_id]
        );
      } else {
        await execute(
          "INSERT IGNORE INTO user_branch_access (user_id, branch_id, access_type) VALUES (?,?, 'handler')",
          [user_id, branch_id]
        );
        await execute(
          `INSERT INTO user_branch_roles (user_id, branch_id, role)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE role = VALUES(role)`,
          [user_id, branch_id, membershipRole]
        );
      }
    } else {
      const membershipRole = assignment === "treasury" ? "treasury" : "supervisor";
      if (action === "remove") {
        await execute(
          `DELETE FROM user_branch_roles
            WHERE user_id=? AND branch_id=? AND role = ?`,
          [user_id, branch_id, membershipRole]
        );
      } else {
        await execute(
          `INSERT INTO user_branch_roles (user_id, branch_id, role)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE role = VALUES(role)`,
          [user_id, branch_id, membershipRole]
        );
      }
    }

    await audit({
      userId: session.id,
      action: `user_access_${action || "add"}`,
      entityType:
        assignment === "accounts" || assignment === "accounts_supervisor"
          ? "user_branch_access"
          : "user_branch_roles",
      entityId: user_id,
      newValue: { branch_id, kind: assignment },
    });
    return ok();
  } catch (err) {
    return fail(err);
  }
}
