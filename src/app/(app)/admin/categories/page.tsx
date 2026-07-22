import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { ExpenseCategory } from "@/lib/types";
import { PageHeader } from "@/components/page-chrome";
import CategoryEditor from "./CategoryEditor";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  await requireRole(["admin"]);
  const categories = await query<ExpenseCategory>(
    "SELECT * FROM expense_categories ORDER BY charge_type, category_name"
  );
  return (
    <div>
      <PageHeader title="Expense Categories" subtitle="Editable list of job and non-job categories" />
      <CategoryEditor categories={JSON.parse(JSON.stringify(categories))} />
    </div>
  );
}
