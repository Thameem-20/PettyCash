import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { execute } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const session = await requireApiSession(["admin"]);
    const { id, job_code, branch_id, description, is_active } = await req.json();
    if (!job_code || !branch_id) throw new ApiError(400, "Job code and branch are required");

    if (id) {
      await execute(
        "UPDATE job_code_mapping SET job_code=?, branch_id=?, description=?, is_active=? WHERE id=?",
        [String(job_code).trim(), branch_id, description || null, is_active ? 1 : 0, id]
      );
      await audit({ userId: session.id, action: "update_job_code", entityType: "job_code_mapping", entityId: id });
    } else {
      const res = await execute(
        "INSERT INTO job_code_mapping (job_code, branch_id, description) VALUES (?,?,?)",
        [String(job_code).trim(), branch_id, description || null]
      );
      await audit({ userId: session.id, action: "create_job_code", entityType: "job_code_mapping", entityId: res.insertId });
    }
    return ok();
  } catch (err) {
    return fail(err);
  }
}
