import { execute, query, queryOne } from "./db";
import type { ChargeTypeScope } from "./chargeTypePolicy";

export type BranchRequestMode = "job_based" | "compassion";
export type BranchCodingType = "zybo" | "pcp_jv" | "none";

export interface BranchProfile {
  branch_id: number;
  branch_name: string;
  branch_code: string;
  request_mode: BranchRequestMode;
  coding_type: BranchCodingType;
  default_supervisor_user_id: number | null;
  allow_suspense: number;
  charge_type_scope: ChargeTypeScope;
}

const DEFAULT_PROFILE = {
  request_mode: "job_based" as BranchRequestMode,
  coding_type: "zybo" as BranchCodingType,
  default_supervisor_user_id: null as number | null,
  allow_suspense: 1,
  charge_type_scope: "job_and_non_job" as ChargeTypeScope,
};

const PROFILE_SELECT = `
  SELECT b.id AS branch_id, b.branch_name, b.branch_code,
         COALESCE(p.request_mode, 'job_based') AS request_mode,
         COALESCE(p.coding_type, 'zybo') AS coding_type,
         p.default_supervisor_user_id,
         COALESCE(p.allow_suspense, 1) AS allow_suspense,
         COALESCE(p.charge_type_scope, 'job_and_non_job') AS charge_type_scope
    FROM branches b
    LEFT JOIN branch_profiles p ON p.branch_id = b.id`;

export function isCompassionMode(
  profile: Pick<BranchProfile, "request_mode"> | null | undefined
): boolean {
  return profile?.request_mode === "compassion";
}

export function codingType(
  profile: Pick<BranchProfile, "coding_type"> | null | undefined
): BranchCodingType {
  return profile?.coding_type ?? "zybo";
}

export async function getBranchProfile(branchId: number): Promise<BranchProfile | null> {
  return queryOne<BranchProfile>(`${PROFILE_SELECT} WHERE b.id = ?`, [branchId]);
}

export async function getBranchProfileByCode(branchCode: string): Promise<BranchProfile | null> {
  return queryOne<BranchProfile>(
    `${PROFILE_SELECT} WHERE b.branch_code = ? AND b.is_active = 1`,
    [branchCode]
  );
}

export async function listBranchProfiles(): Promise<BranchProfile[]> {
  return query<BranchProfile>(
    `${PROFILE_SELECT} WHERE b.is_active = 1 ORDER BY b.branch_name`
  );
}

/** Ensure a profile row exists (lazy create with defaults). */
export async function ensureBranchProfile(branchId: number): Promise<BranchProfile> {
  const existing = await getBranchProfile(branchId);
  if (existing) return existing;

  await execute(
    `INSERT INTO branch_profiles (branch_id, request_mode, coding_type, allow_suspense, charge_type_scope)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE branch_id = branch_id`,
    [
      branchId,
      DEFAULT_PROFILE.request_mode,
      DEFAULT_PROFILE.coding_type,
      DEFAULT_PROFILE.allow_suspense,
      DEFAULT_PROFILE.charge_type_scope,
    ]
  );
  const created = await getBranchProfile(branchId);
  if (!created) throw new Error(`Branch ${branchId} not found`);
  return created;
}

export async function updateBranchProfile(
  branchId: number,
  patch: {
    request_mode?: BranchRequestMode;
    coding_type?: BranchCodingType;
    default_supervisor_user_id?: number | null;
    allow_suspense?: boolean;
    charge_type_scope?: ChargeTypeScope;
  }
): Promise<void> {
  await ensureBranchProfile(branchId);
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.request_mode != null) {
    sets.push("request_mode = ?");
    params.push(patch.request_mode);
  }
  if (patch.coding_type != null) {
    sets.push("coding_type = ?");
    params.push(patch.coding_type);
  }
  if (patch.default_supervisor_user_id !== undefined) {
    sets.push("default_supervisor_user_id = ?");
    params.push(patch.default_supervisor_user_id);
  }
  if (patch.allow_suspense !== undefined) {
    sets.push("allow_suspense = ?");
    params.push(patch.allow_suspense ? 1 : 0);
  }
  if (patch.charge_type_scope != null) {
    sets.push("charge_type_scope = ?");
    params.push(patch.charge_type_scope);
  }
  if (sets.length === 0) return;
  params.push(branchId);
  await execute(`UPDATE branch_profiles SET ${sets.join(", ")} WHERE branch_id = ?`, params);
}

/** Branches whose coding_type matches (for nav badges / queues). */
export async function branchIdsWithCodingType(
  coding: BranchCodingType,
  amongIds?: number[]
): Promise<number[]> {
  if (amongIds && amongIds.length === 0) return [];
  const params: unknown[] = [coding];
  let sql = `
    SELECT b.id
      FROM branches b
      LEFT JOIN branch_profiles p ON p.branch_id = b.id
     WHERE b.is_active = 1
       AND COALESCE(p.coding_type, 'zybo') = ?`;
  if (amongIds) {
    sql += ` AND b.id IN (${amongIds.map(() => "?").join(",")})`;
    params.push(...amongIds);
  }
  const rows = await query<{ id: number }>(sql, params);
  return rows.map((r) => r.id);
}
