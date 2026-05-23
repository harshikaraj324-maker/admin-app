import { Router, type IRouter, type Request, type Response } from "express";
import pg from "pg";
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
  fixDeviceTable,
} from "../lib/supabase-admin.js";

// ── PAT-free realtime fix — uses SUPABASE_DB_URL direct connection ──────────
async function fixRealtimeDirect(appToken: string): Promise<void> {
  const dbUrl = process.env["SUPABASE_DB_URL"];
  if (!dbUrl) throw new Error("SUPABASE_DB_URL env var not set");
  const tableName = `${appToken}_registered_devices`;
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`ALTER TABLE ${tableName} REPLICA IDENTITY FULL`);
    await client.query(`
      DO $rt$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime'
            AND schemaname = 'public'
            AND tablename = '${tableName}'
        ) THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE ${tableName};
        END IF;
      END $rt$
    `);
  } finally {
    await client.end();
  }
}

const router: IRouter = Router();

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
  const clean = token.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!clean) {
    res.status(400).json({ error: "invalid token: only a-z0-9 allowed" });
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

// ─── Fix Realtime — no PAT needed, uses SUPABASE_DB_URL ──────
router.post("/apps/:token/fix-realtime", async (req: Request, res: Response) => {
  const token = req.params["token"] as string;
  try {
    await fixRealtimeDirect(token);
    res.json({ ok: true, message: "REPLICA IDENTITY FULL + supabase_realtime publication set!" });
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

export default router;
