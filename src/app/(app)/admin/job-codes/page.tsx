import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { resolveAccountsBranch, type AccountsBranch } from "@/lib/accountsBranch";
import { PageHeader } from "@/components/page-chrome";
import JobCodeEditor from "./JobCodeEditor";

export const dynamic = "force-dynamic";

export default async function AdminJobCodesPage() {
  await requireRole(["admin"]);
  const codes = await query(
    `SELECT j.*, b.branch_name FROM job_code_mapping j JOIN branches b ON b.id = j.branch_id ORDER BY j.job_code`
  );
  const branches = await query<AccountsBranch>(
    "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
  );
  const defaultBranchId = branches.length ? resolveAccountsBranch(undefined, branches) : 0;
  return (
    <div>
      <PageHeader title="Job Code Mapping" subtitle="Map job number prefixes to branches" />
      <JobCodeEditor
        codes={JSON.parse(JSON.stringify(codes))}
        branches={JSON.parse(JSON.stringify(branches))}
        defaultBranchId={defaultBranchId}
      />
    </div>
  );
}
