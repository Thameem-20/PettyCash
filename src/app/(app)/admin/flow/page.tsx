import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { PageHeader } from "@/components/page-chrome";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import FlowExplorer from "./FlowExplorer";

export const dynamic = "force-dynamic";

export default async function AdminFlowPage() {
  await requireRole(["admin"]);

  const users = await query<{ id: number; name: string; email: string; role: Role; is_active: number }>(
    "SELECT id, name, email, role, is_active FROM users ORDER BY name"
  );

  return (
    <div>
      <PageHeader
        title="Flow"
        subtitle="Pick a user to see who approves and processes their requests, step by step."
      />
      <FlowExplorer
        users={JSON.parse(JSON.stringify(users))}
        roleLabels={ROLE_LABELS}
      />
    </div>
  );
}
