import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { PageHeader } from "@/components/page-chrome";
import CompassionTabs from "./CompassionTabs";
import type { Preset } from "./PresetEditor";

export const dynamic = "force-dynamic";

export default async function AdminCompassionPage() {
  await requireRole(["admin"]);

  const [drivers, presets] = await Promise.all([
    query<{ id: number; name: string; is_active: number }>(
      "SELECT id, name, is_active FROM compassion_drivers ORDER BY name"
    ),
    query<Preset>(
      "SELECT id, kind, value, is_active FROM compassion_presets ORDER BY kind, value"
    ),
  ]);

  const trucks = presets.filter((p) => p.kind === "truck");
  const trailers = presets.filter((p) => p.kind === "trailer");
  const descriptions = presets.filter((p) => p.kind === "description");

  return (
    <div>
      <PageHeader
        title="Compassion"
        subtitle="Drivers and quick-fill presets for Compassion (COMP) requests"
      />
      <CompassionTabs
        drivers={JSON.parse(JSON.stringify(drivers))}
        trucks={JSON.parse(JSON.stringify(trucks))}
        trailers={JSON.parse(JSON.stringify(trailers))}
        descriptions={JSON.parse(JSON.stringify(descriptions))}
      />
    </div>
  );
}
