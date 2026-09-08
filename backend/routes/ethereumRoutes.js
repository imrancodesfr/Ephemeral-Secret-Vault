import { Router } from "express";
import { getEthereumStatus, getContractSource } from "../controllers/ethereumController.js";

const router = Router();

router.get("/status", getEthereumStatus);
router.get("/contract/:name", getContractSource);

export default router;
