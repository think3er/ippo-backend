import { Router, Request, Response } from "express";
import prisma from "../db";
import { requireAuth, requireCircleMember } from "../middleware/auth";
import { pillarJournalSchema } from "../validators";
import { z } from "zod";

const router = Router();
router.use(requireAuth);

// ─── Post a Journal Entry (shared with circle) ──────
router.post("/:id/journals", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const data = pillarJournalSchema.parse(req.body);
    const circleId = req.params.id;

    const journal = await prisma.pillarJournal.create({
      data: {
        userId: req.userId!,
        circleId,
        pillar: data.pillar,
        title: data.title,
        content: data.content,
      },
      include: {
        user: { select: { id: true, name: true, handle: true, avatarUrl: true } },
        comments: {
          include: { user: { select: { id: true, name: true, handle: true } } },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { comments: true } },
      },
    });

    res.status(201).json({ journal });
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err.errors });
      return;
    }
    console.error("Journal post error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Get Circle Journal Feed ─────────────────────────
// All journals from all members, newest first
router.get("/:id/journals", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const circleId = req.params.id;
    const pillar = req.query.pillar as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const where: any = { circleId };
    if (pillar) where.pillar = pillar;

    const [journals, total] = await Promise.all([
      prisma.pillarJournal.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, handle: true, avatarUrl: true } },
          comments: {
            include: { user: { select: { id: true, name: true, handle: true } } },
            orderBy: { createdAt: "asc" },
          },
          _count: { select: { comments: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.pillarJournal.count({ where }),
    ]);

    res.json({
      journals,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("Journal feed error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Get Single Journal with Comments ────────────────
router.get("/:id/journals/:journalId", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const journal = await prisma.pillarJournal.findUnique({
      where: { id: req.params.journalId },
      include: {
        user: { select: { id: true, name: true, handle: true, avatarUrl: true } },
        comments: {
          include: { user: { select: { id: true, name: true, handle: true, avatarUrl: true } } },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { comments: true } },
      },
    });

    if (!journal || journal.circleId !== req.params.id) {
      res.status(404).json({ error: "Journal not found" });
      return;
    }

    res.json({ journal });
  } catch (err) {
    console.error("Get journal error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Get My Journals ─────────────────────────────────
router.get("/:id/journals/me", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const pillar = req.query.pillar as string | undefined;
    const date = req.query.date as string | undefined;

    const where: any = { userId: req.userId!, circleId: req.params.id };
    if (pillar) where.pillar = pillar;
    if (date) {
      // Filter journals created on that date
      const start = new Date(date + "T00:00:00.000Z");
      const end = new Date(date + "T23:59:59.999Z");
      where.createdAt = { gte: start, lte: end };
    }

    const journals = await prisma.pillarJournal.findMany({
      where,
      include: {
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ journals });
  } catch (err) {
    console.error("My journals error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Add Comment to Journal ──────────────────────────
const commentSchema = z.object({
  content: z.string().min(1).max(2000),
});

router.post("/:id/journals/:journalId/comments", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const data = commentSchema.parse(req.body);

    // Verify journal belongs to this circle
    const journal = await prisma.pillarJournal.findUnique({
      where: { id: req.params.journalId },
    });
    if (!journal || journal.circleId !== req.params.id) {
      res.status(404).json({ error: "Journal not found" });
      return;
    }

    const comment = await prisma.journalComment.create({
      data: {
        journalId: req.params.journalId,
        userId: req.userId!,
        content: data.content,
      },
      include: {
        user: { select: { id: true, name: true, handle: true, avatarUrl: true } },
      },
    });

    res.status(201).json({ comment });
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err.errors });
      return;
    }
    console.error("Comment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete Comment (own only) ───────────────────────
router.delete("/:id/journals/:journalId/comments/:commentId", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const comment = await prisma.journalComment.findUnique({
      where: { id: req.params.commentId },
    });
    if (!comment || comment.userId !== req.userId) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }
    await prisma.journalComment.delete({ where: { id: req.params.commentId } });
    res.json({ message: "Comment deleted" });
  } catch (err) {
    console.error("Delete comment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete Journal (own only) ───────────────────────
router.delete("/:id/journals/:journalId", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const journal = await prisma.pillarJournal.findUnique({
      where: { id: req.params.journalId },
    });
    if (!journal || journal.userId !== req.userId) {
      res.status(404).json({ error: "Journal not found" });
      return;
    }
    await prisma.pillarJournal.delete({ where: { id: req.params.journalId } });
    res.json({ message: "Journal deleted" });
  } catch (err) {
    console.error("Delete journal error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
