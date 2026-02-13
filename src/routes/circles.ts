import { Router, Request, Response } from "express";
import prisma from "../db";
import { requireAuth, requireCircleMember, requireCircleAdmin } from "../middleware/auth";
import { createCircleSchema, updateCircleSchema, joinCircleSchema, updateMemberSchema } from "../validators";
import { generateInviteCode } from "../utils/auth";

const router = Router();
router.use(requireAuth);

router.post("/", async (req: Request, res: Response) => {
  try {
    const data = createCircleSchema.parse(req.body);
    const circle = await prisma.circle.create({
      data: { name: data.name, description: data.description, ownerId: req.userId!, inviteCode: generateInviteCode(), visibilityMode: data.visibilityMode || "score_only" },
    });
    await prisma.circleMember.create({ data: { circleId: circle.id, userId: req.userId!, role: "owner" } });
    res.status(201).json({ circle });
  } catch (err: any) {
    if (err.name === "ZodError") { res.status(400).json({ error: "Validation error", details: err.errors }); return; }
    console.error("Create circle error:", err); res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const memberships = await prisma.circleMember.findMany({
      where: { userId: req.userId! },
      include: { circle: { include: { _count: { select: { members: true } } } } },
    });
    const circles = memberships.map((m) => ({ ...m.circle, memberCount: m.circle._count.members, myRole: m.role }));
    res.json({ circles });
  } catch (err) { console.error("List circles error:", err); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/:id", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const circle = await prisma.circle.findUnique({
      where: { id: req.params.id },
      include: { members: { include: { user: { select: { id: true, name: true, handle: true, avatarUrl: true } } } }, _count: { select: { members: true } } },
    });
    if (!circle) { res.status(404).json({ error: "Circle not found" }); return; }
    res.json({ circle });
  } catch (err) { console.error("Get circle error:", err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/:id/invite", requireCircleMember, requireCircleAdmin, async (req: Request, res: Response) => {
  try {
    const circle = await prisma.circle.findUnique({ where: { id: req.params.id } });
    if (!circle) { res.status(404).json({ error: "Circle not found" }); return; }
    res.json({ inviteCode: circle.inviteCode });
  } catch (err) { console.error("Invite error:", err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/join", async (req: Request, res: Response) => {
  try {
    const { inviteCode } = joinCircleSchema.parse(req.body);
    const circle = await prisma.circle.findUnique({ where: { inviteCode } });
    if (!circle) { res.status(404).json({ error: "Invalid invite code" }); return; }
    const existing = await prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId: circle.id, userId: req.userId! } },
    });
    if (existing) { res.status(409).json({ error: "Already a member of this circle" }); return; }
    await prisma.circleMember.create({ data: { circleId: circle.id, userId: req.userId!, role: "member" } });
    res.status(201).json({ message: "Joined circle", circleId: circle.id, circleName: circle.name });
  } catch (err: any) {
    if (err.name === "ZodError") { res.status(400).json({ error: "Validation error", details: err.errors }); return; }
    console.error("Join error:", err); res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id", requireCircleMember, requireCircleAdmin, async (req: Request, res: Response) => {
  try {
    const data = updateCircleSchema.parse(req.body);
    const circle = await prisma.circle.update({
      where: { id: req.params.id },
      data: { ...(data.name && { name: data.name }), ...(data.description !== undefined && { description: data.description }), ...(data.visibilityMode && { visibilityMode: data.visibilityMode }) },
    });
    res.json({ circle });
  } catch (err: any) {
    if (err.name === "ZodError") { res.status(400).json({ error: "Validation error", details: err.errors }); return; }
    console.error("Update circle error:", err); res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireCircleMember, async (req: Request, res: Response) => {
  try {
    if ((req as any).memberRole !== "owner") { res.status(403).json({ error: "Only the owner can delete the circle" }); return; }
    await prisma.circle.delete({ where: { id: req.params.id } });
    res.json({ message: "Circle deleted" });
  } catch (err) { console.error("Delete circle error:", err); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/:id/members", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const members = await prisma.circleMember.findMany({
      where: { circleId: req.params.id },
      include: { user: { select: { id: true, name: true, handle: true, avatarUrl: true } } },
    });
    res.json({ members });
  } catch (err) { console.error("List members error:", err); res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/:id/members/:memberId", requireCircleMember, requireCircleAdmin, async (req: Request, res: Response) => {
  try {
    const { role } = updateMemberSchema.parse(req.body);
    const member = await prisma.circleMember.update({ where: { id: req.params.memberId }, data: { role } });
    res.json({ member });
  } catch (err: any) {
    if (err.name === "ZodError") { res.status(400).json({ error: "Validation error", details: err.errors }); return; }
    console.error("Update member error:", err); res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id/members/:memberId", requireCircleMember, requireCircleAdmin, async (req: Request, res: Response) => {
  try {
    await prisma.circleMember.delete({ where: { id: req.params.memberId } });
    res.json({ message: "Member removed" });
  } catch (err) { console.error("Remove member error:", err); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
