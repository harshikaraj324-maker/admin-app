import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import adminRouter from "./admin.js";
import deviceRouter from "./device.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin", adminRouter);
router.use("/device", deviceRouter);

export default router;
