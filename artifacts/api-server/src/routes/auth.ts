import { Router, type Request, type Response } from "express";
import {
  hasPassword, verifyPassword, hashPassword, setPasswordHash,
  createSession, validateSession, deleteSession,
} from "../lib/auth.js";

const router = Router();

// GET /api/admin/auth/status
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const passwordSet = await hasPassword();
    res.json({ passwordSet });
  } catch {
    res.json({ passwordSet: false });
  }
});

// POST /api/admin/auth/login — { password }
router.post("/login", async (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!password?.trim()) {
    res.status(400).json({ error: "Password required" });
    return;
  }
  try {
    const set = await hasPassword();
    if (!set) {
      const hash = await hashPassword(password.trim());
      await setPasswordHash(hash);
      const token = createSession();
      res.json({ token, firstTime: true });
      return;
    }
    const ok = await verifyPassword(password.trim());
    if (!ok) { res.status(401).json({ error: "Wrong password" }); return; }
    res.json({ token: createSession() });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/admin/auth/logout
router.post("/logout", (req: Request, res: Response) => {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  deleteSession(token);
  res.json({ ok: true });
});

// POST /api/admin/auth/change-password — { currentPassword, newPassword }
router.post("/change-password", async (req: Request, res: Response) => {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!validateSession(token)) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (!currentPassword?.trim() || !newPassword?.trim()) {
    res.status(400).json({ error: "Both passwords required" });
    return;
  }
  try {
    const ok = await verifyPassword(currentPassword.trim());
    if (!ok) { res.status(401).json({ error: "Current password galat hai" }); return; }
    const hash = await hashPassword(newPassword.trim());
    await setPasswordHash(hash);
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
