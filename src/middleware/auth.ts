import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/auth";
import prisma from "../db";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  try {
    const token = header.slice(7);
    const payload = verifyToken(token);
    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function requireCircleMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  const circleId = req.params.id || req.params.circleId;
  if (!circleId) { res.status(400).json({ error: "Circle ID required" }); return; }
  const membership = await prisma.circleMember.findUnique({
    where: { circleId_userId: { circleId, userId: req.userId! } },
  });
  if (!membership) { res.status(403).json({ error: "Not a member of this circle" }); return; }
  (req as any).memberRole = membership.role;
  next();
}

export async function requireCircleAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const role = (req as any).memberRole;
  if (role !== "owner" && role !== "admin") {
    res.status(403).json({ error: "Admin or owner role required" });
    return;
  }
  next();
}
