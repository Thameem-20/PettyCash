import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { execute, queryOne } from "@/lib/db";
import { audit } from "@/lib/audit";

function normalizeLastFour(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.slice(-4);
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireApiSession(["admin"]);
    const { id, branch_id, bank_name, last_four, is_active } = await req.json();
    const name = String(bank_name || "").trim();
    const lastFour = normalizeLastFour(String(last_four || ""));
    const branchId = Number(branch_id);

    if (!name) throw new ApiError(400, "Bank name is required");
    if (lastFour.length !== 4) throw new ApiError(400, "Enter the last 4 digits of the account");
    if (!Number.isFinite(branchId) || branchId <= 0) {
      throw new ApiError(400, "Branch is required");
    }

    const branch = await queryOne<{ id: number }>(
      "SELECT id FROM branches WHERE id = ? AND is_active = 1",
      [branchId]
    );
    if (!branch) throw new ApiError(400, "Selected branch is invalid");

    if (id) {
      await execute(
        "UPDATE bank_accounts SET branch_id=?, bank_name=?, last_four=?, is_active=? WHERE id=?",
        [branchId, name, lastFour, is_active ? 1 : 0, id]
      );
      await audit({
        userId: session.id,
        action: "update_bank_account",
        entityType: "bank_account",
        entityId: id,
      });
    } else {
      const res = await execute(
        "INSERT INTO bank_accounts (branch_id, bank_name, last_four, is_active) VALUES (?,?,?,?)",
        [branchId, name, lastFour, is_active === false ? 0 : 1]
      );
      await audit({
        userId: session.id,
        action: "create_bank_account",
        entityType: "bank_account",
        entityId: res.insertId,
      });
    }
    return ok();
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
    if (code === "ER_DUP_ENTRY") {
      return fail(new ApiError(409, "This bank account already exists for that branch"));
    }
    return fail(err);
  }
}
