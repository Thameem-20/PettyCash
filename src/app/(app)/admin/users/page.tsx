import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Users management lives in Control Panel. */
export default async function AdminUsersPage() {
  await requireRole(["admin"]);
  redirect("/admin/control-panel?tab=users");
}
