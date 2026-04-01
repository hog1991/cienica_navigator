import { Router, type IRouter } from "express";
import healthRouter from "./health";
import docusignRouter from "./docusign";
import docusignAuthRouter from "./docusign-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(docusignAuthRouter);
router.use(docusignRouter);

export default router;
