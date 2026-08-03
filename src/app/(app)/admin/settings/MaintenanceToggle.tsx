"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MaintenanceToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function save(next: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/settings/maintenance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Failed to update");
        return;
      }
      setEnabled(Boolean(data.enabled));
      setMessage(
        data.enabled
          ? "Maintenance mode is ON. Users can sign in, then see the maintenance page. Admins still use the app."
          : "Maintenance mode is OFF. The app is open to all users."
      );
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground md:text-sm">
        When enabled, users can still sign in, but after login they only see the maintenance page.
        Admins keep full access.
      </p>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-3">
        <span>
          <span className="block text-sm font-semibold text-foreground">Maintenance mode</span>
          <span className="block text-xs text-muted-foreground">
            {enabled ? "Currently ON — non-admins see maintenance after login" : "Currently OFF"}
          </span>
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={enabled}
          disabled={busy}
          onChange={(e) => save(e.target.checked)}
        />
      </label>

      {error && <p className="text-sm text-rose-700">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}
    </div>
  );
}
