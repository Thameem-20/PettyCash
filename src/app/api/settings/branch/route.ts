import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { allowAllBranchesForRole } from "@/lib/accountsBranch";
import { listWorkspaceBranchesForUser } from "@/lib/branchMembership";
import { query } from "@/lib/db";
import { normalizeBranchParam, setUserBranchPreference } from "@/lib/preferredBranch";

/** Legacy cookie name — cleared so old clients stop overriding DB preference. */
const LEGACY_BRANCH_COOKIE = "pc_branch";

export async function PUT(req: NextRequest) {
  try {
    const session = await requireApiSession();
    const body = await req.json();
    const raw = body?.branch;
    const branch =
      raw === "all" || raw === "All"
        ? "all"
        : normalizeBranchParam(raw == null ? undefined : String(raw));

    if (!branch) throw new ApiError(400, "Invalid branch");

    const primary = session.primary_role || session.role;
    const allowAll = allowAllBranchesForRole(primary);
    const memberships = await listWorkspaceBranchesForUser(session.id);

    const allowedIds = new Set(memberships.map((b) => b.id));
    if (allowAll) {
      const all = await query<{ id: number }>(
        "SELECT id FROM branches WHERE is_active = 1"
      );
      for (const b of all) allowedIds.add(b.id);
    }

    if (allowedIds.size === 0) throw new ApiError(400, "No branches available");

    if (branch === "all") {
      if (!allowAll) throw new ApiError(403, "All branches is not available for your role");
      await setUserBranchPreference(session.id, "all");
    } else {
      const id = Number(branch);
      if (!allowedIds.has(id)) {
        throw new ApiError(403, "Branch is not assigned to you");
      }
      await setUserBranchPreference(session.id, id);
    }

    const res = ok({ branch });
    // Drop legacy cookie if present.
    res.cookies.set(LEGACY_BRANCH_COOKIE, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    });
    return res;
  } catch (err) {
    return fail(err);
  }
}
