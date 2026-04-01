import { Router, type IRouter } from "express";
import healthRouter from "./health";
import docusignRouter from "./docusign";

const router: IRouter = Router();

router.use(healthRouter);
router.use(docusignRouter);

export default router;
