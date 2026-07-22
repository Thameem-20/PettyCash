import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { execute } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const session = await requireApiSession(["admin"]);
    const { id, category_name, charge_type, job_number_required, is_active } = await req.json();
    if (!category_name || !["job", "non_job", "truck_trailer", "general"].includes(charge_type))
      throw new ApiError(400, "Name and valid charge type are required");
    const jobReq = charge_type === "job" ? 1 : job_number_required ? 1 : 0;

    if (id) {
      await execute(
        "UPDATE expense_categories SET category_name=?, charge_type=?, job_number_required=?, is_active=? WHERE id=?",
        [category_name, charge_type, jobReq, is_active ? 1 : 0, id]
      );
      await audit({ userId: session.id, action: "update_category", entityType: "expense_category", entityId: id });
    } else {
      const res = await execute(
        "INSERT INTO expense_categories (category_name, charge_type, job_number_required) VALUES (?,?,?)",
        [category_name, charge_type, jobReq]
      );
      await audit({ userId: session.id, action: "create_category", entityType: "expense_category", entityId: res.insertId });
    }
    return ok();
  } catch (err) {
    return fail(err);
  }
}
