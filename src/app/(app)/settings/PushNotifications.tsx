"use client";

import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  const reg =
    existing ||
    (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));

  if (reg.installing) {
    await new Promise<void>((resolve) => {
      const sw = reg.installing!;
      sw.addEventListener("statechange", () => {
        if (sw.state === "activated" || sw.state === "redundant") resolve();
      });
    });
  }

  await navigator.serviceWorker.ready;

  const ready = await navigator.serviceWorker.getRegistration("/");
  return ready || reg;
}

async function subscribeWithKey(
  reg: ServiceWorkerRegistration,
  publicKey: string
): Promise<PushSubscription> {
  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    try {
      await existing.unsubscribe();
    } catch {
      // continue
    }
  }

  try {
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  } catch {
    await new Promise((r) => setTimeout(r, 600));
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }
}

function friendlyPushError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || "");
  const lower = msg.toLowerCase();

  if (lower.includes("push service error") || lower.includes("registration failed")) {
    return (
      "Chrome could not reach its push service (FCM). Check your network/VPN/ad-blocker, " +
      "try another browser (Edge/Firefox), or try again in a moment."
    );
  }
  if (lower.includes("notallowed") || lower.includes("permission")) {
    return "Notification permission was blocked. Allow notifications for this site in browser settings.";
  }
  if (lower.includes("abort")) {
    return "Push subscription was aborted. Refresh the page and try again.";
  }
  return msg || "Could not enable notifications";
}

export default function PushNotifications() {
  const [supported, setSupported] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refreshStatus = useCallback(async () => {
    if (typeof window === "undefined") return;
    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      window.isSecureContext;
    setSupported(ok);
    if (!ok) return;

    setPermission(Notification.permission);

    const res = await fetch("/api/push/subscribe");
    const data = await res.json();
    if (!data.ok) return;
    setConfigured(Boolean(data.configured));
    setPublicKey(data.publicKey || null);
    setSubscribed(Boolean(data.subscribed));
  }, []);

  useEffect(() => {
    refreshStatus().catch(() => undefined);
  }, [refreshStatus]);

  async function enable() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!publicKey) {
        setError("Push is not configured on the server yet. Restart the app after setting VAPID keys.");
        return;
      }

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError("Notification permission was denied.");
        return;
      }

      const reg = await ensureServiceWorker();
      const sub = await subscribeWithKey(reg, publicKey);
      const json = sub.toJSON();

      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError("Browser returned an incomplete push subscription. Try again.");
        return;
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Could not save subscription on the server");
        return;
      }
      setSubscribed(true);
      setMessage("Notifications enabled on this device.");
    } catch (err) {
      setError(friendlyPushError(err));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe().catch(() => undefined);
      } else {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      }
      setSubscribed(false);
      setMessage("Notifications disabled on this device.");
    } catch {
      setError("Could not disable notifications");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Notifications</h2>
        <p className="mt-1 text-sm text-slate-500">
          Push notifications are not supported in this browser. Try Chrome/Edge on localhost or HTTPS,
          or install the app on your phone.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Notifications</h2>
      <p className="mt-1 text-sm text-slate-500">
        Get a push when a request needs your action (for example, supervisor approval or accounts
        review). Works best when the app is installed.
      </p>

      {!configured && (
        <p className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Server push keys are not configured yet. Ask an admin to set VAPID keys and restart the
          server.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
          {subscribed ? "Enabled on this device" : "Not enabled"}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
          Permission: {permission}
        </span>
      </div>

      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
      {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {!subscribed ? (
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !configured}
            onClick={enable}
          >
            {busy ? "Enabling…" : "Enable notifications"}
          </button>
        ) : (
          <button type="button" className="btn-secondary" disabled={busy} onClick={disable}>
            {busy ? "Updating…" : "Disable on this device"}
          </button>
        )}
      </div>
    </section>
  );
}
