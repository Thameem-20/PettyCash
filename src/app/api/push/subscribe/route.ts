import { NextRequest } from "next/server";
import { ApiError, fail, ok, requireApiSession } from "@/lib/api";
import {
  deletePushSubscription,
  getVapidPublicKey,
  isPushConfigured,
  listPushSubscriptionsForUser,
  savePushSubscription,
} from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireApiSession();
    const publicKey = getVapidPublicKey();
    const subs = await listPushSubscriptionsForUser(session.id);
    return ok({
      configured: isPushConfigured(),
      publicKey,
      subscribed: subs.length > 0,
      subscriptionCount: subs.length,
    });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireApiSession();
    if (!isPushConfigured()) {
      throw new ApiError(503, "Push notifications are not configured on the server.");
    }

    const body = await req.json();
    const endpoint = String(body?.endpoint || "").trim();
    const p256dh = String(body?.keys?.p256dh || body?.p256dh || "").trim();
    const auth = String(body?.keys?.auth || body?.auth || "").trim();
    const userAgent = req.headers.get("user-agent");

    if (!endpoint || !p256dh || !auth) {
      throw new ApiError(422, "Invalid push subscription");
    }

    await savePushSubscription({
      userId: session.id,
      endpoint,
      p256dh,
      auth,
      userAgent,
    });

    return ok({ subscribed: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireApiSession();
    const body = await req.json().catch(() => ({}));
    const endpoint = String(body?.endpoint || "").trim();

    if (endpoint) {
      await deletePushSubscription(endpoint, session.id);
    } else {
      const { deletePushSubscriptionsForUser } = await import("@/lib/push");
      await deletePushSubscriptionsForUser(session.id);
    }

    return ok({ subscribed: false });
  } catch (err) {
    return fail(err);
  }
}
