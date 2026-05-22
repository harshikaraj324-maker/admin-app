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
} from "../lib/supabase-admin.js";

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
  try {
    await runSetup();
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
  const { token, label } = req.body as { token?: string; label?: string };
  if (!token?.trim()) {
    res.status(400).json({ error: "token is required" });
    return;
  }
  const clean = token.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!clean) {
    res.status(400).json({ error: "invalid token: only a-z0-9 allowed" });
    return;
  }
  try {
    res.status(201).json(await createApp(clean, (label ?? "").trim()));
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/apps/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const patch = req.body as Record<string, unknown>;
  try {
    await updateApp(id, patch);
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/apps/:id", async (req: Request, res: Response) => {
  try {
    await deleteApp(req.params.id);
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Devices ──────────────────────────────────────────────

router.get("/apps/:token/devices", async (req: Request, res: Response) => {
  try {
    res.json(await getDevices(req.params.token));
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch(
  "/apps/:token/devices/:uid",
  async (req: Request, res: Response) => {
    const patch = req.body as Record<string, unknown>;
    try {
      await patchDevice(req.params.token, req.params.uid, patch);
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(500).json({ error: String(e) });
    }
  }
);

router.delete(
  "/apps/:token/devices/:uid",
  async (req: Request, res: Response) => {
    try {
      await deleteDevice(req.params.token, req.params.uid);
      res.json({ ok: true });
    } catch (e: unknown) {
      res.status(500).json({ error: String(e) });
    }
  }
);

export default router;
