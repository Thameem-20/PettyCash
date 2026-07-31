import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import { execute, queryOne } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const session = await requireApiSession(["admin"]);
    const body = await req.json();
    const id = body.id != null ? Number(body.id) : null;
    const plateNo = String(body.plate_no || "").trim();
    const label = String(body.label || "").trim();
    const isActive = body.is_active !== false && body.is_active !== 0;

    if (!plateNo) throw new ApiError(400, "Plate number is required");
    if (!label) throw new ApiError(400, "Vehicle name is required");

    if (id) {
      const existing = await queryOne<{ id: number }>(
        "SELECT id FROM fleet_vehicles WHERE id = ?",
        [id]
      );
      if (!existing) throw new ApiError(404, "Vehicle not found");

      const clash = await queryOne<{ id: number }>(
        "SELECT id FROM fleet_vehicles WHERE LOWER(plate_no) = LOWER(?) AND id <> ?",
        [plateNo, id]
      );
      if (clash) throw new ApiError(409, "That plate number is already registered");

      await execute(
        "UPDATE fleet_vehicles SET plate_no=?, label=?, is_active=? WHERE id=?",
        [plateNo, label, isActive ? 1 : 0, id]
      );
      await audit({
        userId: session.id,
        action: "update_fleet_vehicle",
        entityType: "fleet_vehicle",
        entityId: id,
      });
      return ok({ id, plate_no: plateNo, label, is_active: isActive ? 1 : 0 });
    }

    const clash = await queryOne<{ id: number }>(
      "SELECT id FROM fleet_vehicles WHERE LOWER(plate_no) = LOWER(?)",
      [plateNo]
    );
    if (clash) throw new ApiError(409, "That plate number is already registered");

    const res = await execute(
      "INSERT INTO fleet_vehicles (plate_no, label) VALUES (?,?)",
      [plateNo, label]
    );
    await audit({
      userId: session.id,
      action: "create_fleet_vehicle",
      entityType: "fleet_vehicle",
      entityId: res.insertId,
    });
    return ok({
      id: res.insertId,
      plate_no: plateNo,
      label,
      is_active: 1,
    });
  } catch (err) {
    return fail(err);
  }
}
