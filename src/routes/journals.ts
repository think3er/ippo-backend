import { Router, Request, Response } from "express";
import prisma from "../db";
import { requireAuth, requireCircleMember } from "../middleware/auth";
import { pillarJournalSchema } from "../validators";
import { notifyPostOwner } from "../utils/push";

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
        imageUrl: data.imageUrl,
      },
      include: {
        user: { select: { id: true, name: true, handle: true, avatarUrl: true } },
        comments: {
          include: { user: { select: { id: true, name: true, handle: true } } },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { comments: true, likes: true } },
      },
    });

    res.status(201).json({ journal });
  } catch (err: any) {
    if (err.name === "ZodError") { res.status(400).json({ error: "Validation error", details: err.errors }); return; }
    console.error("Journal post error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Get Circle Feed ─────────────────────────────
router.get("/:id/journals", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const circleId = req.params.id;
    const pillar = req.query.pillar as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = 20;

    const where: any = { circleId };
    if (pillar) where.pillar = pillar;

    const [journals, total] = await Promise.all([
      prisma.pillarJournal.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, handle: true, avatarUrl: true } },
          _count: { select: { comments: true, likes: true } },
          likes: { where: { userId: req.userId! }, select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.pillarJournal.count({ where }),
    ]);

    const journalsWithLikeStatus = journals.map((j) => ({
      ...j,
      isLikedByMe: j.likes.length > 0,
      likes: undefined,
    }));

    res.json({
      journals: journalsWithLikeStatus,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("Feed error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Get Single Journal ──────────────────────────
router.get("/:id/journals/:journalId", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const journal = await prisma.pillarJournal.findUnique({
      where: { id: req.params.journalId },
      include: {
        user: { select: { id: true, name: true, handle: true, avatarUrl: true } },
        comments: {
          include: { user: { select: { id: true, name: true, handle: true } } },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { comments: true, likes: true } },
        likes: { where: { userId: req.userId! }, select: { id: true } },
      },
    });

    if (!journal) { res.status(404).json({ error: "Journal not found" }); return; }

    res.json({
      journal: {
        ...journal,
        isLikedByMe: journal.likes.length > 0,
        likes: undefined,
      },
    });
  } catch (err) {
    console.error("Get journal error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Like / Unlike a Journal Post ────────────────
router.post("/:id/journals/:journalId/like", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const { journalId } = req.params;
    const existing = await prisma.journalLike.findUnique({
      where: { journalId_userId: { journalId, userId: req.userId! } },
    });

    if (existing) {
      // Unlike
      await prisma.journalLike.delete({ where: { id: existing.id } });
      const count = await prisma.journalLike.count({ where: { journalId } });
      res.json({ liked: false, likeCount: count });
    } else {
      // Like
      await prisma.journalLike.create({ data: { journalId, userId: req.userId! } });
      const count = await prisma.journalLike.count({ where: { journalId } });
      res.json({ liked: true, likeCount: count });

      // Send push notification to post owner (don't await — fire and forget)
      const journal = await prisma.pillarJournal.findUnique({ where: { id: journalId }, select: { userId: true, title: true } });
      const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
      if (journal && journal.userId !== req.userId! && actor) {
        notifyPostOwner(journal.userId, actor.name, "like", journal.title || undefined);
      }
    }
  } catch (err) {
    console.error("Like error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Get My Journals ─────────────────────────────
router.get("/:id/journals/me", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const journals = await prisma.pillarJournal.findMany({
      where: { circleId: req.params.id, userId: req.userId! },
      include: { _count: { select: { comments: true, likes: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ journals });
  } catch (err) {
    console.error("My journals error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Add Comment ─────────────────────────────────
router.post("/:id/journals/:journalId/comments", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    if (!content || content.trim().length === 0) {
      res.status(400).json({ error: "Content required" }); return;
    }

    const comment = await prisma.journalComment.create({
      data: { journalId: req.params.journalId, userId: req.userId!, content: content.trim() },
      include: { user: { select: { id: true, name: true, handle: true } } },
    });

    res.status(201).json({ comment });

    // Send push notification to post owner
    const journal = await prisma.pillarJournal.findUnique({ where: { id: req.params.journalId }, select: { userId: true, title: true } });
    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
    if (journal && journal.userId !== req.userId! && actor) {
      notifyPostOwner(journal.userId, actor.name, "comment", journal.title || undefined);
    }
  } catch (err) {
    console.error("Comment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete Comment ──────────────────────────────
router.delete("/:id/journals/:journalId/comments/:commentId", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const comment = await prisma.journalComment.findUnique({ where: { id: req.params.commentId } });
    if (!comment || comment.userId !== req.userId!) {
      res.status(403).json({ error: "Cannot delete this comment" }); return;
    }
    await prisma.journalComment.delete({ where: { id: req.params.commentId } });
    res.json({ message: "Comment deleted" });
  } catch (err) {
    console.error("Delete comment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete Journal ──────────────────────────────
router.delete("/:id/journals/:journalId", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const journal = await prisma.pillarJournal.findUnique({ where: { id: req.params.journalId } });
    if (!journal || journal.userId !== req.userId!) {
      res.status(403).json({ error: "Cannot delete this journal" }); return;
    }
    await prisma.pillarJournal.delete({ where: { id: req.params.journalId } });
    res.json({ message: "Journal deleted" });
  } catch (err) {
    console.error("Delete journal error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
