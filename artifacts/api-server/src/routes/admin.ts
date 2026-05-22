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
