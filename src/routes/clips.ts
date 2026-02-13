import { Router, Request, Response } from "express";
import prisma from "../db";
import { requireAuth, requireCircleMember } from "../middleware/auth";
import { postClipSchema, updateRotationSchema } from "../validators";

const router = Router();
router.use(requireAuth);

// Get current active clip + rotation info
router.get("/:id/clips/current", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const circleId = req.params.id;
    const clip = await prisma.circleClip.findFirst({
      where: { circleId, isActive: true },
      include: { postedBy: { select: { id: true, name: true, handle: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
    });
    const rotation = await prisma.clipRotation.findUnique({
      where: { circleId },
      include: { currentUser: { select: { id: true, name: true, handle: true, avatarUrl: true, email: true } } },
    });
    let rotationInfo = null;
    if (rotation) {
      const daysSince = Math.floor((Date.now() - rotation.lastRotatedAt.getTime()) / (1000 * 60 * 60 * 24));
      rotationInfo = {
        currentUser: rotation.currentUser,
        intervalDays: rotation.intervalDays,
        lastRotatedAt: rotation.lastRotatedAt.toISOString(),
        needsRotation: daysSince >= rotation.intervalDays,
        isMyTurn: rotation.currentUserId === req.userId,
      };
    }
    res.json({ clip, rotation: rotationInfo });
  } catch (err) { console.error("Get current clip error:", err); res.status(500).json({ error: "Internal server error" }); }
});

// Get clip history
router.get("/:id/clips", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const clips = await prisma.circleClip.findMany({
      where: { circleId: req.params.id },
      include: { postedBy: { select: { id: true, name: true, handle: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ clips });
  } catch (err) { console.error("Clip history error:", err); res.status(500).json({ error: "Internal server error" }); }
});

// Post new clip
router.post("/:id/clips", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const data = postClipSchema.parse(req.body);
    const circleId = req.params.id;
    // Deactivate previous clip
    await prisma.circleClip.updateMany({ where: { circleId, isActive: true }, data: { isActive: false } });
    const clip = await prisma.circleClip.create({
      data: { circleId, postedById: req.userId!, videoUrl: data.videoUrl, title: data.title, caption: data.caption },
      include: { postedBy: { select: { id: true, name: true, handle: true, avatarUrl: true } } },
    });
    // Advance rotation if exists
    const rotation = await prisma.clipRotation.findUnique({ where: { circleId } });
    if (rotation && rotation.rotationOrder.length > 0) {
      const currentIdx = rotation.rotationOrder.indexOf(req.userId!);
      const nextIdx = (currentIdx + 1) % rotation.rotationOrder.length;
      await prisma.clipRotation.update({
        where: { circleId },
        data: { currentUserId: rotation.rotationOrder[nextIdx], lastRotatedAt: new Date() },
      });
    }
    res.status(201).json({ clip });
  } catch (err: any) {
    if (err.name === "ZodError") { res.status(400).json({ error: "Validation error", details: err.errors }); return; }
    console.error("Post clip error:", err); res.status(500).json({ error: "Internal server error" });
  }
});

// Setup/update rotation
router.post("/:id/clips/rotation", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const data = updateRotationSchema.parse(req.body);
    const circleId = req.params.id;
    const members = await prisma.circleMember.findMany({ where: { circleId }, select: { userId: true } });
    const order = members.map((m) => m.userId);
    const rotation = await prisma.clipRotation.upsert({
      where: { circleId },
      create: { circleId, currentUserId: order[0], rotationOrder: order, intervalDays: data.intervalDays || 3 },
      update: { rotationOrder: order, ...(data.intervalDays && { intervalDays: data.intervalDays }) },
    });
    res.json({ message: "Rotation updated", rotation });
  } catch (err: any) {
    if (err.name === "ZodError") { res.status(400).json({ error: "Validation error", details: err.errors }); return; }
    console.error("Rotation error:", err); res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
