import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health.js";
import adminRouter from "./admin.js";
import deviceRouter from "./device.js";
import authRouter from "./auth.js";
import { validateSession } from "../lib/auth.js";

const router: IRouter = Router();

// ─── Auth routes (no session required) ────────────────────
router.use("/admin/auth", authRouter);

// ─── Auth middleware for all other /admin/* routes ─────────
const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const path = req.path;
  // Allow: /setup/*, /pat
  if (path.startsWith("/setup") || path === "/pat") {
    next();
    return;
  }
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!validateSession(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

router.use(healthRouter);
router.use("/admin", requireAuth, adminRouter);
router.use("/device", deviceRouter);

export default router;
