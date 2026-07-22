import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { Branch } from "@/lib/types";
import { PageHeader } from "@/components/page-chrome";
import BranchEditor from "./BranchEditor";

export const dynamic = "force-dynamic";

export default async function AdminBranchesPage() {
  await requireRole(["admin"]);
  const branches = await query<Branch>("SELECT * FROM branches ORDER BY branch_name");
  return (
    <div>
      <PageHeader title="Branches" subtitle="Manage branch cashboxes" />
      <BranchEditor branches={JSON.parse(JSON.stringify(branches))} />
    </div>
  );
}
