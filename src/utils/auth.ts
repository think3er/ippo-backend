import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || "15m";
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || "7d";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface TokenPayload {
  userId: string;
  email: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_EXPIRY });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function generateInviteCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

export function computeScore(pillars: {
  deen: boolean; body: boolean; mind: boolean; mission: boolean; brotherhood: boolean;
}): number {
  return [pillars.deen, pillars.body, pillars.mind, pillars.mission, pillars.brotherhood].filter(Boolean).length;
}
