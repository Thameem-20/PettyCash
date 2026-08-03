import { requireRole } from "@/lib/session";
import { getStoredThemeId, isMaintenanceMode } from "@/lib/appSettings";
import { PageHeader } from "@/components/page-chrome";
import ThemePicker from "./ThemePicker";
import MaintenanceToggle from "./MaintenanceToggle";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireRole(["admin"]);
  const themeId = await getStoredThemeId();
  const maintenanceOn = await isMaintenanceMode();

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="App-wide appearance and preferences"
      />
      <div className="space-y-4">
        <section className="card space-y-3 p-3 md:p-5">
          <h2 className="text-sm font-semibold text-foreground md:text-base">Maintenance</h2>
          <MaintenanceToggle initialEnabled={maintenanceOn} />
        </section>
        <section className="card space-y-3 p-3 md:p-5">
          <h2 className="text-sm font-semibold text-foreground md:text-base">Color palette</h2>
          <ThemePicker initialThemeId={themeId} />
        </section>
      </div>
    </div>
  );
}
