/**
 * Push Notification Service (server-side)
 *
 * Sends Web Push notifications to subscribers stored in the
 * NotificationSubscription table. Uses the `web-push` library.
 *
 * Notification types:
 *   - content_published  : a scheduled post went live
 *   - analytics_update   : weekly/daily analytics digest
 *   - account_disconnected: a connected platform account needs re-auth
 *   - schedule_reminder  : upcoming post reminder (e.g. 15 min before)
 */

import webPush, { PushSubscription, WebPushError } from "web-push";
import { prisma } from "@/shared/infrastructure/database/postgres";

// VAPID keys must be set in environment. Generate with:
//   npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@minitik.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export type NotificationType =
  | "content_published"
  | "analytics_update"
  | "account_disconnected"
  | "schedule_reminder";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
}

export interface SendResult {
  subscriptionId: string;
  success: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * Send a push notification to all active subscriptions for a user.
 * Expired/invalid subscriptions (HTTP 410/404) are removed automatically.
 */
export async function sendToUser(
  userId: string,
  payload: NotificationPayload
): Promise<SendResult[]> {
  const subscriptions = await prisma.notificationSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) return [];

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      sendToSubscription(sub.id, {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, payload)
    )
  );

  const sendResults: SendResult[] = results.map((r, i) => {
    const id = subscriptions[i].id;
    if (r.status === "fulfilled") return r.value;
    return { subscriptionId: id, success: false, error: String(r.reason) };
  });

  // Prune expired subscriptions
  const expiredIds = sendResults
    .filter((r) => r.statusCode === 410 || r.statusCode === 404)
    .map((r) => r.subscriptionId);

  if (expiredIds.length > 0) {
    await prisma.notificationSubscription.deleteMany({
      where: { id: { in: expiredIds } },
    });
  }

  return sendResults;
}

async function sendToSubscription(
  subscriptionId: string,
  pushSub: PushSubscription,
  payload: NotificationPayload
): Promise<SendResult> {
  try {
    await webPush.sendNotification(pushSub, JSON.stringify(payload), {
      urgency: urgencyFor(payload.type),
      TTL: ttlFor(payload.type),
    });
    return { subscriptionId, success: true };
  } catch (err) {
    const wpErr = err as WebPushError;
    return {
      subscriptionId,
      success: false,
      error: wpErr.message ?? String(err),
      statusCode: wpErr.statusCode,
    };
  }
}

function urgencyFor(type: NotificationType): "very-low" | "low" | "normal" | "high" {
  if (type === "account_disconnected") return "high";
  if (type === "schedule_reminder") return "high";
  if (type === "content_published") return "normal";
  return "low";
}

function ttlFor(type: NotificationType): number {
  // Time-to-live in seconds — how long the push service should retry delivery
  if (type === "schedule_reminder") return 900; // 15 minutes
  if (type === "account_disconnected") return 3600; // 1 hour
  if (type === "content_published") return 86400; // 24 hours
  return 86400;
}

// ─── Subscription management ──────────────────────────────────────────────────

export interface SubscribeInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function saveSubscription(input: SubscribeInput): Promise<void> {
  await prisma.notificationSubscription.upsert({
    where: { endpoint: input.endpoint },
    update: { p256dh: input.p256dh, auth: input.auth },
    create: {
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
    },
  });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await prisma.notificationSubscription.delete({
    where: { endpoint },
  }).catch(() => undefined); // ignore if already deleted
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

// ─── Typed notification builders ──────────────────────────────────────────────

export function buildContentPublishedNotification(
  title: string,
  platform: string,
  contentId: string
): NotificationPayload {
  return {
    type: "content_published",
    title: "Published!",
    body: `"${title}" is live on ${platform}.`,
    url: `/content/${contentId}`,
    data: { contentId, platform },
  };
}

export function buildAnalyticsUpdateNotification(
  summary: string
): NotificationPayload {
  return {
    type: "analytics_update",
    title: "Analytics Update",
    body: summary,
    url: "/analytics",
  };
}

export function buildAccountDisconnectedNotification(
  platform: string,
  accountId: string
): NotificationPayload {
  return {
    type: "account_disconnected",
    title: "Account Disconnected",
    body: `Your ${platform} account needs to be reconnected.`,
    url: "/accounts",
    data: { accountId, platform },
  };
}

export function buildScheduleReminderNotification(
  title: string,
  minutesUntil: number,
  contentId: string
): NotificationPayload {
  return {
    type: "schedule_reminder",
    title: "Upcoming Post",
    body: `"${title}" publishes in ${minutesUntil} minute${minutesUntil !== 1 ? "s" : ""}.`,
    url: `/content/${contentId}`,
    data: { contentId, minutesUntil },
  };
}
