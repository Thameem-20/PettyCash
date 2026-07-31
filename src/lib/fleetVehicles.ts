import { query } from "./db";

export type FleetVehicle = {
  id: number;
  plate_no: string;
  label: string;
  is_active: number;
};

export async function listActiveFleetVehicles(): Promise<
  { id: number; plate_no: string; label: string }[]
> {
  return query(
    `SELECT id, plate_no, label FROM fleet_vehicles
      WHERE is_active = 1
      ORDER BY plate_no`
  );
}

export async function findActiveFleetVehicleByPlate(
  plateNo: string
): Promise<{ id: number; plate_no: string; label: string } | null> {
  const trimmed = plateNo.trim();
  if (!trimmed) return null;
  const rows = await query<{ id: number; plate_no: string; label: string }>(
    `SELECT id, plate_no, label FROM fleet_vehicles
      WHERE is_active = 1 AND LOWER(plate_no) = LOWER(?)
      LIMIT 1`,
    [trimmed]
  );
  return rows[0] ?? null;
}
