import { Router, Request, Response } from "express";
import prisma from "../db";
import { hashPassword, verifyPassword, signAccessToken, signRefreshToken, verifyToken } from "../utils/auth";
import { registerSchema, loginSchema, refreshSchema } from "../validators";
import { requireAuth } from "../middleware/auth";
import crypto from "crypto";

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: data.email }, { handle: data.handle }] },
    });
    if (existing) {
      res.status(409).json({ error: existing.email === data.email ? "Email already registered" : "Handle already taken" });
      return;
    }
    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: { email: data.email, passwordHash, name: data.name, handle: data.handle, timezone: data.timezone },
    });
    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email });
    await prisma.refreshToken.create({
      data: { token: crypto.createHash("sha256").update(refreshToken).digest("hex"), userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name, handle: user.handle },
      accessToken, refreshToken,
    });
  } catch (err: any) {
    if (err.name === "ZodError") { res.status(400).json({ error: "Validation error", details: err.errors }); return; }
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email });
    await prisma.refreshToken.create({
      data: { token: crypto.createHash("sha256").update(refreshToken).digest("hex"), userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    res.json({
      user: { id: user.id, email: user.email, name: user.name, handle: user.handle },
      accessToken, refreshToken,
    });
  } catch (err: any) {
    if (err.name === "ZodError") { res.status(400).json({ error: "Validation error", details: err.errors }); return; }
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const payload = verifyToken(refreshToken);
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const stored = await prisma.refreshToken.findUnique({ where: { token: tokenHash } });
    if (!stored || stored.expiresAt < new Date()) {
      res.status(401).json({ error: "Invalid or expired refresh token" }); return;
    }
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    const newAccessToken = signAccessToken({ userId: payload.userId, email: payload.email });
    const newRefreshToken = signRefreshToken({ userId: payload.userId, email: payload.email });
    await prisma.refreshToken.create({
      data: { token: crypto.createHash("sha256").update(newRefreshToken).digest("hex"), userId: payload.userId, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err: any) {
    if (err.name === "ZodError") { res.status(400).json({ error: "Validation error", details: err.errors }); return; }
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.post("/logout", requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.refreshToken.deleteMany({ where: { userId: req.userId! } });
    res.json({ message: "Logged out" });
  } catch (err) { console.error("Logout error:", err); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true, name: true, handle: true, avatarUrl: true, timezone: true, createdAt: true },
    });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ user });
  } catch (err) { console.error("Me error:", err); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
