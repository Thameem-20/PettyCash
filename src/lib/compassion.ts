import { query, queryOne } from "./db";

export const COMPASSION_BRANCH_CODE = "COMP";

export type CompassionChargeType = "truck_trailer" | "general";

export function isCompassionChargeType(t: string): t is CompassionChargeType {
  return t === "truck_trailer" || t === "general";
}

export async function getCompassionBranch(): Promise<{
  id: number;
  branch_name: string;
  branch_code: string;
} | null> {
  return queryOne(
    "SELECT id, branch_name, branch_code FROM branches WHERE branch_code = ? AND is_active = 1",
    [COMPASSION_BRANCH_CODE]
  );
}

/** Prefer supervisor with COMP as default branch; fallback: name contains Asif. */
export async function getCompassionSupervisorId(): Promise<number | null> {
  const branch = await getCompassionBranch();
  if (!branch) return null;

  const byBranch = await queryOne<{ id: number }>(
    `SELECT id FROM users
      WHERE role = 'supervisor' AND is_active = 1 AND default_branch_id = ?
      ORDER BY id ASC LIMIT 1`,
    [branch.id]
  );
  if (byBranch) return byBranch.id;

  const byName = await queryOne<{ id: number }>(
    `SELECT id FROM users
      WHERE role = 'supervisor' AND is_active = 1
        AND (name LIKE '%Asif%' OR email LIKE '%asif%')
      ORDER BY id ASC LIMIT 1`
  );
  return byName?.id ?? null;
}

export async function listActiveCompassionDrivers(): Promise<{ id: number; name: string }[]> {
  return query(
    "SELECT id, name FROM compassion_drivers WHERE is_active = 1 ORDER BY name"
  );
}
