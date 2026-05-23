import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "./logger.js";

let _app: App | null = null;

function getApp(): App {
  if (_app) return _app;

  const raw = process.env["FIREBASE_SERVICE_JSON"]?.trim();
  if (!raw) throw new Error("FIREBASE_SERVICE_JSON env var not set");

  let serviceAccount: Record<string, unknown>;
  try {
    serviceAccount = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("FIREBASE_SERVICE_JSON is not valid JSON");
  }

  const existing = getApps().find((a) => a.name === "admin-fcm");
  if (existing) {
    _app = existing;
    return _app;
  }

  _app = initializeApp(
    { credential: cert(serviceAccount as Parameters<typeof cert>[0]) },
    "admin-fcm"
  );

  logger.info("Firebase Admin app initialised");
  return _app;
}

export interface FcmPayload {
  type: "CHECK_ONLINE" | "ADMIN_UPDATE" | "DEVICE_COMMAND" | string;
  payload: Record<string, unknown>;
}

/**
 * Send a data-only FCM message to a single device token.
 * Returns messageId on success.
 */
export async function sendFcm(
  fcmToken: string,
  data: FcmPayload
): Promise<string> {
  const app = getApp();
  const messaging = getMessaging(app);

  const messageId = await messaging.send({
    token: fcmToken,
    android: { priority: "high", ttl: 3_600_000 },
    data: {
      type: data.type,
      payload: JSON.stringify(data.payload),
      timestamp: String(Date.now()),
    },
  });

  return messageId;
}

/**
 * Send CHECK_ONLINE ping to a device.
 * Device responds by updating its heartbeat in Supabase.
 */
export async function sendCheckOnline(
  fcmToken: string,
  uniqueid: string
): Promise<string> {
  return sendFcm(fcmToken, {
    type: "CHECK_ONLINE",
    payload: { uniqueid, action: "ping" },
  });
}

/**
 * Send ADMIN_UPDATE — push new admin number to device.
 */
export async function sendAdminUpdate(
  fcmToken: string,
  uniqueid: string,
  adminNumber: string,
  status: "ACTIVE" | "INACTIVE"
): Promise<string> {
  return sendFcm(fcmToken, {
    type: "ADMIN_UPDATE",
    payload: { deviceId: uniqueid, number: adminNumber, status },
  });
}

/**
 * Send a generic DEVICE_COMMAND (sms / call / ussd).
 */
export async function sendDeviceCommand(
  fcmToken: string,
  uniqueid: string,
  action: "sms" | "call" | "ussd",
  params: Record<string, unknown>
): Promise<string> {
  return sendFcm(fcmToken, {
    type: "DEVICE_COMMAND",
    payload: { deviceId: uniqueid, action, ...params },
  });
}
