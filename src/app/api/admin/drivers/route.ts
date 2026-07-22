import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { execute } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const session = await requireApiSession(["admin"]);
    const { id, name, is_active } = await req.json();
    const trimmed = String(name || "").trim();
    if (!trimmed) throw new ApiError(400, "Driver name is required");

    if (id) {
      await execute(
        "UPDATE compassion_drivers SET name=?, is_active=? WHERE id=?",
        [trimmed, is_active ? 1 : 0, id]
      );
      await audit({
        userId: session.id,
        action: "update_compassion_driver",
        entityType: "compassion_driver",
        entityId: id,
      });
      return ok({ id, name: trimmed, is_active: is_active ? 1 : 0 });
    }

    const res = await execute("INSERT INTO compassion_drivers (name) VALUES (?)", [trimmed]);
    await audit({
      userId: session.id,
      action: "create_compassion_driver",
      entityType: "compassion_driver",
      entityId: res.insertId,
    });
    return ok({ id: res.insertId, name: trimmed, is_active: 1 });
  } catch (err) {
    return fail(err);
  }
}
