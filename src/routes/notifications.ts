import { Router, Request, Response } from "express";
import prisma from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// Register device token for push notifications
router.post("/device-token", async (req: Request, res: Response) => {
  try {
    const { token, platform } = req.body;
    if (!token) { res.status(400).json({ error: "Token required" }); return; }

    await prisma.deviceToken.upsert({
      where: { token },
      create: { userId: req.userId!, token, platform: platform || "ios" },
      update: { userId: req.userId! },
    });

    res.json({ message: "Device registered" });
  } catch (err) {
    console.error("Device token error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Remove device token (on logout)
router.delete("/device-token", async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (token) {
      await prisma.deviceToken.deleteMany({ where: { token } });
    }
    res.json({ message: "Device unregistered" });
  } catch (err) {
    console.error("Delete device token error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get push notification settings
router.get("/push-settings", async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { pushEnabled: true },
    });
    res.json({ pushEnabled: user?.pushEnabled ?? true });
  } catch (err) {
    console.error("Get push settings error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update push notification settings
router.patch("/push-settings", async (req: Request, res: Response) => {
  try {
    const { pushEnabled } = req.body;
    if (typeof pushEnabled !== "boolean") {
      res.status(400).json({ error: "pushEnabled must be a boolean" }); return;
    }
    await prisma.user.update({
      where: { id: req.userId! },
      data: { pushEnabled },
    });
    res.json({ pushEnabled });
  } catch (err) {
    console.error("Update push settings error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
