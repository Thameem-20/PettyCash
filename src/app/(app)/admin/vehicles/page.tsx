import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { PageHeader } from "@/components/page-chrome";
import VehicleEditor, { type FleetVehicleRow } from "./VehicleEditor";

export const dynamic = "force-dynamic";

export default async function AdminVehiclesPage() {
  await requireRole(["admin"]);

  const vehicles = await query<FleetVehicleRow>(
    "SELECT id, plate_no, label, is_active FROM fleet_vehicles ORDER BY plate_no"
  );

  return (
    <div>
      <PageHeader
        title="Vehicles"
        subtitle="Plate numbers and car names for messenger / cash requester fuel charges"
      />
      <VehicleEditor vehicles={JSON.parse(JSON.stringify(vehicles))} />
    </div>
  );
}
