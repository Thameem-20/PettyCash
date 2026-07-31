import webpush from "web-push";
import { execute, query } from "./db";
import type { ApprovalPath } from "./approvalPolicy";
import { accountsBranchIds } from "./requests";

export type PushSubscriptionRow = {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

let vapidConfigured = false;

function configureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@localhost";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim());
}

export async function savePushSubscription(input: {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<void> {
  await execute(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       p256dh = VALUES(p256dh),
       auth = VALUES(auth),
       user_agent = VALUES(user_agent)`,
    [
      input.userId,
      input.endpoint,
      input.p256dh,
      input.auth,
      input.userAgent ?? null,
    ]
  );
}

export async function deletePushSubscription(endpoint: string, userId?: number): Promise<void> {
  if (userId != null) {
    await execute(`DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?`, [
      endpoint,
      userId,
    ]);
    return;
  }
  await execute(`DELETE FROM push_subscriptions WHERE endpoint = ?`, [endpoint]);
}

export async function deletePushSubscriptionsForUser(userId: number): Promise<void> {
  await execute(`DELETE FROM push_subscriptions WHERE user_id = ?`, [userId]);
}

export async function listPushSubscriptionsForUser(
  userId: number
): Promise<PushSubscriptionRow[]> {
  return query<PushSubscriptionRow>(
    `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`,
    [userId]
  );
}

async function listPushSubscriptionsForUsers(
  userIds: number[]
): Promise<PushSubscriptionRow[]> {
  if (userIds.length === 0) return [];
  const ph = userIds.map(() => "?").join(",");
  return query<PushSubscriptionRow>(
    `SELECT id, user_id, endpoint, p256dh, auth
       FROM push_subscriptions
      WHERE user_id IN (${ph})`,
    userIds
  );
}

/** Send a notification to every stored subscription for the given users. */
export async function sendPushToUsers(
  userIds: number[],
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const unique = [...new Set(userIds.filter((id) => id > 0))];
  if (unique.length === 0) {
    console.info("[push] skip: no user ids");
    return { sent: 0, failed: 0 };
  }
  if (!configureVapid()) {
    console.warn("[push] skip: VAPID not configured");
    return { sent: 0, failed: 0 };
  }

  const subs = await listPushSubscriptionsForUsers(unique);
  if (subs.length === 0) {
    console.info("[push] skip: no subscriptions for users", unique);
    return { sent: 0, failed: 0 };
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/dashboard",
    tag: payload.tag || "petty-cash",
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const res = await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
        sent += 1;
        console.info("[push] sent", {
          userId: sub.user_id,
          status: res.statusCode,
          tag: payload.tag,
        });
      } catch (err: unknown) {
        failed += 1;
        const status = (err as { statusCode?: number; body?: string; message?: string })
          ?.statusCode;
        const message =
          (err as { body?: string; message?: string })?.body ||
          (err as { message?: string })?.message ||
          "unknown";
        console.warn("[push] failed", { userId: sub.user_id, status, message });
        // Gone / expired subscription
        if (status === 404 || status === 410) {
          await deletePushSubscription(sub.endpoint).catch(() => undefined);
        }
      }
    })
  );

  return { sent, failed };
}

/** Fire-and-forget wrapper so API responses are not delayed by push. */
export function notifyUsersAsync(userIds: number[], payload: PushPayload): void {
  void sendPushToUsers(userIds, payload).catch((err) => {
    console.error("[push] notifyUsersAsync error", err);
  });
}

async function accountsUsersForBranch(branchId: number): Promise<number[]> {
  const handlers = await query<{ id: number }>(
    `SELECT DISTINCT u.id
       FROM users u
       JOIN user_branch_access uba ON uba.user_id = u.id
      WHERE uba.branch_id = ?
        AND u.is_active = 1
        AND u.role IN ('accounts', 'accounts_supervisor')`,
    [branchId]
  );
  const fromRoles = await query<{ id: number }>(
    `SELECT DISTINCT u.id
       FROM users u
       JOIN user_branch_roles ubr ON ubr.user_id = u.id
      WHERE ubr.branch_id = ?
        AND ubr.role IN ('accounts', 'accounts_supervisor')
        AND u.is_active = 1`,
    [branchId]
  );

  const accSupAll = await query<{ id: number }>(
    `SELECT id FROM users WHERE role = 'accounts_supervisor' AND is_active = 1`
  );

  const ids = new Set<number>();
  for (const r of [...handlers, ...fromRoles]) ids.add(r.id);

  for (const u of accSupAll) {
    const assigned = await accountsBranchIds(u.id);
    if (assigned.length === 0 || assigned.includes(branchId)) ids.add(u.id);
  }

  return [...ids];
}

/**
 * Decide who should be notified when a new request is submitted,
 * based on approval path / first action owner.
 */
export async function resolveNewRequestNotifyUserIds(input: {
  approvalPath: ApprovalPath;
  needsSupervisor: boolean;
  supervisorId: number | null;
  accountsUserId: number | null;
  branchId: number;
}): Promise<number[]> {
  if (input.needsSupervisor) {
    return input.supervisorId ? [input.supervisorId] : [];
  }

  if (input.approvalPath === "accounts_supervisor_then_pay") {
    const accSup = await query<{ id: number }>(
      `SELECT id FROM users WHERE role = 'accounts_supervisor' AND is_active = 1`
    );
    const ids: number[] = [];
    for (const u of accSup) {
      const assigned = await accountsBranchIds(u.id);
      if (assigned.length === 0 || assigned.includes(input.branchId)) ids.push(u.id);
    }
    return ids;
  }

  // direct_accounts / self_approve_pending_payment → accounts side
  const ids = new Set(await accountsUsersForBranch(input.branchId));
  if (input.accountsUserId) ids.add(input.accountsUserId);
  return [...ids];
}
