import { Router, type IRouter, type Request, type Response } from "express";
import { deviceSmartUpsert, deviceGetByUid } from "../lib/supabase-admin.js";

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
    res.json({ ok: true, data: result });
  } catch (e: unknown) {
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
      // Flatten form fields directly into device row — smart upsert will
      // keep known columns as columns and move unknown ones to data_json
      ...body.data,
      // also nest under form_data key for clean querying from admin
      form_data: body.data,
      last_heartbeat_at: Date.now(),
    };

    const result = await deviceSmartUpsert(appToken, payload);
    res.json({ ok: true, data: result });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
