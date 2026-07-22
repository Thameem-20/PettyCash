import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import type { BankAccount } from "@/lib/types";
import { PageHeader } from "@/components/page-chrome";
import BankEditor from "./BankEditor";

export const dynamic = "force-dynamic";

export default async function AdminBanksPage() {
  await requireRole(["admin"]);
  const [banks, branches] = await Promise.all([
    query<BankAccount>(
      `SELECT ba.*, b.branch_name, b.branch_code
         FROM bank_accounts ba
         JOIN branches b ON b.id = ba.branch_id
        ORDER BY b.branch_name, ba.bank_name, ba.last_four`
    ),
    query<{ id: number; branch_name: string; branch_code: string }>(
      "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
    ),
  ]);
  return (
    <div>
      <PageHeader
        title="Bank Accounts"
        subtitle="Per-branch accounts shown when top-up payment source is Bank Account"
      />
      <BankEditor
        banks={JSON.parse(JSON.stringify(banks))}
        branches={JSON.parse(JSON.stringify(branches))}
      />
    </div>
  );
}
