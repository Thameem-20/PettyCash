import { queryOne } from "./db";
import { jobNumberBranchSegment } from "./zyboVoucher";

/** Branch segment for PC-{segment}-{yy}-{suffix} */
export async function resolveZyboBranchSegment(
  branchId: number,
  jobNumber: string | null | undefined
): Promise<string> {
  const fromJob = jobNumberBranchSegment(jobNumber);
  if (fromJob) return fromJob;

  const row = await queryOne<{ job_code: string }>(
    `SELECT job_code FROM job_code_mapping
      WHERE branch_id = ? AND is_active = 1
      ORDER BY job_code LIMIT 1`,
    [branchId]
  );
  return row?.job_code ?? String(branchId);
}
