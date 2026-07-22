import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { execute } from "@/lib/db";
import { audit } from "@/lib/audit";

const KINDS = new Set(["truck", "trailer", "description"]);

export async function POST(req: NextRequest) {
  try {
    const session = await requireApiSession(["admin"]);
    const { id, kind, value, is_active } = await req.json();
    const trimmed = String(value || "").trim();
    const kindStr = String(kind || "");
    if (!KINDS.has(kindStr)) throw new ApiError(400, "Invalid preset kind");
    if (!trimmed) throw new ApiError(400, "Value is required");

    if (id) {
      await execute(
        "UPDATE compassion_presets SET kind=?, value=?, is_active=? WHERE id=?",
        [kindStr, trimmed, is_active ? 1 : 0, id]
      );
      await audit({
        userId: session.id,
        action: "update_compassion_preset",
        entityType: "compassion_preset",
        entityId: id,
        newValue: { kind: kindStr, value: trimmed, is_active: Boolean(is_active) },
      });
      return ok({ id, kind: kindStr, value: trimmed, is_active: is_active ? 1 : 0 });
    }

    const res = await execute(
      "INSERT INTO compassion_presets (kind, value) VALUES (?,?)",
      [kindStr, trimmed]
    );
    await audit({
      userId: session.id,
      action: "create_compassion_preset",
      entityType: "compassion_preset",
      entityId: res.insertId,
      newValue: { kind: kindStr, value: trimmed },
    });
    return ok({ id: res.insertId, kind: kindStr, value: trimmed, is_active: 1 });
  } catch (err) {
    return fail(err);
  }
}
