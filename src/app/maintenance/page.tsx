import { redirect } from "next/navigation";
import { isMaintenanceMode } from "@/lib/appSettings";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const on = await isMaintenanceMode();
  const session = await getSession();

  if (!on) {
    redirect(session ? "/dashboard" : "/login");
  }

  // Not signed in yet — send them to login first.
  if (!session) {
    redirect("/login");
  }

  const isAdmin = session.role === "admin" || session.primary_role === "admin";
  if (isAdmin) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-100 px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Petty Cash</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Under maintenance</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          The app is temporarily unavailable while we carry out maintenance. Please try again
          later.
        </p>
      </div>
    </div>
  );
}
