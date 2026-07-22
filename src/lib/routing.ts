import { query, queryOne } from "./db";
import { Branch, JobCodeMapping } from "./types";

// Job number format e.g. 133/SIMP/26/225 -> first segment is the branch code.
const JOB_NUMBER_RE = /^([A-Za-z0-9]+)\/[^/]+\/[^/]+\/[^/]+$/;

export function normalizeJobNumber(jobNumber: string): string {
  return jobNumber.trim().toUpperCase();
}

export function isValidJobNumberFormat(jobNumber: string): boolean {
  return JOB_NUMBER_RE.test(jobNumber.trim());
}

export function extractJobCode(jobNumber: string): string | null {
  const m = jobNumber.trim().match(JOB_NUMBER_RE);
  return m ? m[1] : null;
}

export interface BranchResolution {
  ok: boolean;
  branch?: Branch;
  jobCode?: string;
  error?: string;
}

/** Resolve the branch for a job-related request from its job number. */
export async function resolveBranchFromJobNumber(jobNumber: string): Promise<BranchResolution> {
  jobNumber = normalizeJobNumber(jobNumber);
  if (!isValidJobNumberFormat(jobNumber)) {
    return { ok: false, error: "Invalid job number format. Expected e.g. 133/SIMP/26/225." };
  }
  const code = extractJobCode(jobNumber)!;
  const mapping = await queryOne<JobCodeMapping>(
    "SELECT * FROM job_code_mapping WHERE job_code = ? AND is_active = 1",
    [code]
  );
  if (!mapping) {
    return {
      ok: false,
      jobCode: code,
      error: "Branch could not be identified from job number. Please contact supervisor/admin.",
    };
  }
  const branch = await queryOne<Branch>("SELECT * FROM branches WHERE id = ? AND is_active = 1", [
    mapping.branch_id,
  ]);
  if (!branch) {
    return { ok: false, jobCode: code, error: "Mapped branch is inactive or missing." };
  }
  return { ok: true, branch, jobCode: code };
}

/** Normalize and dedupe job numbers from form input. */
export function parseJobNumbers(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const n = normalizeJobNumber(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** Resolve branch from one or more job numbers — all must map to the same branch. */
export async function resolveBranchFromJobNumbers(jobNumbers: string[]): Promise<BranchResolution> {
  const normalized = parseJobNumbers(jobNumbers);
  if (normalized.length === 0) {
    return { ok: false, error: "At least one job number is required." };
  }

  let branch: Branch | undefined;
  for (const jn of normalized) {
    const res = await resolveBranchFromJobNumber(jn);
    if (!res.ok || !res.branch) return res;
    if (!branch) {
      branch = res.branch;
    } else if (res.branch.id !== branch.id) {
      return {
        ok: false,
        error: "All job numbers must belong to the same branch.",
      };
    }
  }
  return { ok: true, branch };
}

export interface HandlerInfo {
  branch: Branch;
  handlers: { id: number; name: string }[];
}

/** Return the accounts handlers assigned to a branch (for the confirmation prompt). */
export async function getBranchHandlers(branchId: number): Promise<HandlerInfo | null> {
  const branch = await queryOne<Branch>("SELECT * FROM branches WHERE id = ?", [branchId]);
  if (!branch) return null;
  const handlers = await query<{ id: number; name: string }>(
    `SELECT u.id, u.name
       FROM user_branch_access uba
       JOIN users u ON u.id = uba.user_id
      WHERE uba.branch_id = ? AND uba.access_type = 'handler' AND u.is_active = 1 AND u.role = 'accounts'
      ORDER BY u.name`,
    [branchId]
  );
  return { branch, handlers };
}

/** Pick a single accounts user to assign as primary owner of a request. */
export async function pickAccountsUser(branchId: number): Promise<number | null> {
  const row = await queryOne<{ id: number }>(
    `SELECT u.id
       FROM user_branch_access uba
       JOIN users u ON u.id = uba.user_id
      WHERE uba.branch_id = ? AND uba.access_type = 'handler' AND u.is_active = 1 AND u.role = 'accounts'
      ORDER BY u.id LIMIT 1`,
    [branchId]
  );
  return row ? row.id : null;
}
