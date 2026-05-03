import { Router, type IRouter } from "express";
import healthRouter from "./health";
import intelRouter from "./intel";

const router: IRouter = Router();

router.use(healthRouter);
router.use(intelRouter);

export default router;
