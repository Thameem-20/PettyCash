import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/page-chrome";
import { isStaffReimbursementRole } from "@/lib/status";
import NewRequestForm from "./NewRequestForm";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const session = await requireRole([
    "cash_requester",
    "messenger",
    "operations",
    "supervisor",
    "accounts",
    "accounts_supervisor",
    "admin",
  ]);
  const staff = isStaffReimbursementRole(session.role);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        backHref="/requests"
        hideBackOnMobile
        title={staff ? "New Reimbursement" : "New Petty Cash Request"}
        subtitle={
          staff
            ? "Exact reimbursement only — you will confirm cash after payment"
            : "Fill the form and submit for approval"
        }
      />
      <NewRequestForm
        role={session.role}
        branchKey={
          session.preferred_branch_param ||
          (session.active_branch_id != null ? String(session.active_branch_id) : "")
        }
      />
    </div>
  );
}
