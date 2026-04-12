import { Router, Request, Response } from "express";
import prisma from "../db";
import { requireAuth, requireCircleMember } from "../middleware/auth";
import { notifyPostOwner } from "../utils/push";

const router = Router();
router.use(requireAuth);

// ─── Analyze meal photo with Claude Vision ───────
router.post("/:id/meals/analyze", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) { res.status(400).json({ error: "imageUrl required" }); return; }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { res.status(500).json({ error: "AI service not configured" }); return; }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "url", url: imageUrl },
              },
              {
                type: "text",
                text: `Analyze this food photo. Respond ONLY with a JSON object, no other text:
{"foodName": "name of the dish/food", "calories": estimated_calories_number, "protein": estimated_protein_grams_number}

Be specific with the food name. Give your best estimate for a single serving. Only return the JSON object.`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json() as any;
    const text = data.content?.[0]?.text || "";
    
    // Parse the JSON from Claude's response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Could not parse AI response" });
      return;
    }

    const analysis = JSON.parse(jsonMatch[0]);
    res.json({
      foodName: analysis.foodName || "Unknown food",
      calories: Math.round(analysis.calories || 0),
      protein: Math.round(analysis.protein || 0),
    });
  } catch (err: any) {
    console.error("Meal analysis error:", err);
    res.status(500).json({ error: "Failed to analyze meal" });
  }
});

// ─── Post meal to feed ───────────────────────────
router.post("/:id/meals", requireCircleMember, async (req: Request, res: Response) => {
  try {
    const { imageUrl, mealName, calories, protein, content } = req.body;
    if (!imageUrl || !mealName) {
      res.status(400).json({ error: "imageUrl and mealName required" }); return;
    }

    const journal = await prisma.pillarJournal.create({
      data: {
        userId: req.userId!,
        circleId: req.params.id,
        pillar: "body",
        title: mealName,
        content: content || `${mealName} — ${calories || 0} cal, ${protein || 0}g protein`,
        imageUrl,
        postType: "meal",
        mealName,
        calories: calories || 0,
        protein: protein || 0,
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
    console.error("Post meal error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
