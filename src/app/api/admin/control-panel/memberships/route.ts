import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { listUserBranchRoles, setUserBranchRoles } from "@/lib/branchMembership";
import { query } from "@/lib/db";
import type { Role } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const VALID_ROLES = new Set(Object.keys(ROLE_LABELS) as Role[]);

export async function GET() {
  try {
    await requireApiSession(["admin"]);
    const [memberships, users, branches] = await Promise.all([
      listUserBranchRoles(),
      query<{ id: number; name: string; email: string; role: Role; is_active: number }>(
        `SELECT id, name, email, role, is_active FROM users ORDER BY name`
      ),
      query<{ id: number; branch_name: string; branch_code: string }>(
        `SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name`
      ),
    ]);
    return ok({ memberships, users, branches });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireApiSession(["admin"]);
    const body = await req.json();
    const userId = Number(body.user_id);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new ApiError(422, "user_id is required");
    }
    const raw = Array.isArray(body.memberships) ? body.memberships : [];
    const memberships: { branch_id: number; role: Role }[] = [];
    for (const m of raw) {
      const branch_id = Number(m.branch_id);
      const role = String(m.role || "") as Role;
      if (!Number.isFinite(branch_id) || branch_id <= 0) continue;
      if (!VALID_ROLES.has(role)) throw new ApiError(422, `Invalid role: ${role}`);
      memberships.push({ branch_id, role });
    }
    // Unique by branch — last wins
    const byBranch = new Map<number, Role>();
    for (const m of memberships) byBranch.set(m.branch_id, m.role);
    await setUserBranchRoles(
      userId,
      [...byBranch.entries()].map(([branch_id, role]) => ({ branch_id, role }))
    );
    return ok({ memberships: await listUserBranchRoles(userId) });
  } catch (err) {
    return fail(err);
  }
}
