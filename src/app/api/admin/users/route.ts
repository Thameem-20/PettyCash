import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { execute } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { Role } from "@/lib/types";

const ROLES = [
  "cash_requester",
  "messenger",
  "operations",
  "supervisor",
  "accounts",
  "accounts_supervisor",
  "treasury",
  "admin",
];

/** Keep primary default-branch membership in sync with the user record. */
async function syncPrimaryMembership(
  userId: number,
  role: Role,
  defaultBranchId: number | null
) {
  if (!defaultBranchId) return;
  await execute(
    `INSERT INTO user_branch_roles (user_id, branch_id, role)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    [userId, defaultBranchId, role]
  );
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireApiSession(["admin"]);
    const { id, name, email, password, role, department, default_branch_id, supervisor_id, is_active } =
      await req.json();
    if (!name || !email || !ROLES.includes(role)) throw new ApiError(400, "Name, email and valid role required");

    const branchId = default_branch_id ? Number(default_branch_id) : null;

    if (id) {
      // update; password optional
      if (password) {
        const hash = await bcrypt.hash(String(password), 10);
        await execute("UPDATE users SET password_hash=? WHERE id=?", [hash, id]);
      }
      // Keep workspace preference aligned with default branch (e.g. CLI → non-job-only form).
      await execute(
        `UPDATE users
            SET name=?, email=?, role=?, department=?, default_branch_id=?,
                preferred_branch_id = COALESCE(?, preferred_branch_id),
                prefer_all_branches = IF(? IS NOT NULL, 0, prefer_all_branches),
                supervisor_id=?, is_active=?
          WHERE id=?`,
        [
          name,
          String(email).toLowerCase(),
          role,
          department || null,
          branchId,
          branchId,
          branchId,
          supervisor_id || null,
          is_active ? 1 : 0,
          id,
        ]
      );
      await syncPrimaryMembership(Number(id), role as Role, branchId);
      await audit({ userId: session.id, action: "update_user", entityType: "user", entityId: id });
    } else {
      if (!password) throw new ApiError(400, "Password required for new user");
      const hash = await bcrypt.hash(String(password), 10);
      const res = await execute(
        `INSERT INTO users
           (name, email, password_hash, role, department, default_branch_id, preferred_branch_id, prefer_all_branches, supervisor_id)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          name,
          String(email).toLowerCase(),
          hash,
          role,
          department || null,
          branchId,
          branchId,
          0,
          supervisor_id || null,
        ]
      );
      await syncPrimaryMembership(res.insertId, role as Role, branchId);
      await audit({ userId: session.id, action: "create_user", entityType: "user", entityId: res.insertId });
    }
    return ok();
  } catch (err: any) {
    if (err?.code === "ER_DUP_ENTRY") return fail(new ApiError(409, "Email already exists"));
    return fail(err);
  }
}
