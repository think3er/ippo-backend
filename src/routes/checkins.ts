import { Router, Request, Response } from "express";
import prisma from "../db";
import { requireAuth, requireCircleMember } from "../middleware/auth";
import { checkInSchema, dateQuerySchema, rangeQuerySchema } from "../validators";
import { computeScore } from "../utils/auth";

const router = Router();
router.use(requireAuth);

router.post("/:id/checkins", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const data = checkInSchema.parse(req.body);
    const score = computeScore(data);
    const checkIn = await prisma.dailyCheckIn.upsert({
      where: { userId_circleId_date: { userId: req.userId!, circleId: req.params.id, date: data.date } },
      create: { userId: req.userId!, circleId: req.params.id, date: data.date, deen: data.deen, body: data.body, mind: data.mind, mission: data.mission, brotherhood: data.brotherhood, score, notePrivate: data.notePrivate },
      update: { deen: data.deen, body: data.body, mind: data.mind, mission: data.mission, brotherhood: data.brotherhood, score, notePrivate: data.notePrivate },
    });
    res.status(200).json({ checkIn });
  } catch (err: any) {
    if (err.name === "ZodError") { res.status(400).json({ error: "Validation error", details: err.errors }); return; }
    console.error("Check-in error:", err); res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/checkins", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const { date } = dateQuerySchema.parse(req.query);
    const today = date || new Date().toISOString().slice(0, 10);
    const checkIns = await prisma.dailyCheckIn.findMany({
      where: { circleId: req.params.id, date: today },
      include: { user: { select: { id: true, name: true, handle: true, avatarUrl: true } } },
    });
    const mapped = checkIns.map((ci) => {
      const base = { id: ci.id, userId: ci.userId, user: ci.user, date: ci.date, score: ci.score, deen: ci.deen, body: ci.body, mind: ci.mind, mission: ci.mission, brotherhood: ci.brotherhood };
      if (ci.userId === req.userId) return { ...base, notePrivate: ci.notePrivate };
      return base;
    });
    res.json({ date: today, checkIns: mapped });
  } catch (err: any) {
    if (err.name === "ZodError") { res.status(400).json({ error: "Validation error", details: err.errors }); return; }
    console.error("Get checkins error:", err); res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/checkins/range", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const { start, end } = rangeQuerySchema.parse(req.query);
    const checkIns = await prisma.dailyCheckIn.findMany({
      where: { circleId: req.params.id, date: { gte: start, lte: end } },
      include: { user: { select: { id: true, name: true, handle: true, avatarUrl: true } } },
      orderBy: [{ date: "asc" }, { user: { name: "asc" } }],
    });
    const dayMap: Record<string, number[]> = {};
    for (const ci of checkIns) { if (!dayMap[ci.date]) dayMap[ci.date] = []; dayMap[ci.date].push(ci.score); }
    const dailyAverages = Object.entries(dayMap).map(([date, scores]) => ({
      date, average: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10, count: scores.length,
    }));
    const mapped = checkIns.map((ci) => {
      const base = { id: ci.id, userId: ci.userId, user: ci.user, date: ci.date, score: ci.score, deen: ci.deen, body: ci.body, mind: ci.mind, mission: ci.mission, brotherhood: ci.brotherhood };
      if (ci.userId === req.userId) return { ...base, notePrivate: ci.notePrivate };
      return base;
    });
    res.json({ start, end, checkIns: mapped, dailyAverages });
  } catch (err: any) {
    if (err.name === "ZodError") { res.status(400).json({ error: "Validation error", details: err.errors }); return; }
    console.error("Range checkins error:", err); res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/checkins/me", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const { start, end } = rangeQuerySchema.parse(req.query);
    const checkIns = await prisma.dailyCheckIn.findMany({
      where: { circleId: req.params.id, userId: req.userId!, date: { gte: start, lte: end } },
      orderBy: { date: "asc" },
    });
    res.json({ checkIns });
  } catch (err: any) {
    if (err.name === "ZodError") { res.status(400).json({ error: "Validation error", details: err.errors }); return; }
    console.error("My checkins error:", err); res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
