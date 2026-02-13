import { z } from "zod";

// ─── Auth ────────────────────────────────────────────
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(100),
  handle: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, "Handle: letters, numbers, underscore only"),
  timezone: z.string().optional().default("UTC"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ─── Circles ─────────────────────────────────────────
export const createCircleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  visibilityMode: z.enum(["score_only", "detailed", "custom"]).optional(),
});

export const updateCircleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  visibilityMode: z.enum(["score_only", "detailed", "custom"]).optional(),
});

export const joinCircleSchema = z.object({
  inviteCode: z.string().min(1),
});

// ─── Members ─────────────────────────────────────────
export const updateMemberSchema = z.object({
  role: z.enum(["admin", "member"]),
});

// ─── Daily Check-In ──────────────────────────────────
export const checkInSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  deen: z.boolean().optional().default(false),
  body: z.boolean().optional().default(false),
  mind: z.boolean().optional().default(false),
  mission: z.boolean().optional().default(false),
  brotherhood: z.boolean().optional().default(false),
  notePrivate: z.string().max(2000).optional(),
});

export const dateQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const rangeQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ─── Weekly Reflection ───────────────────────────────
export const reflectionSchema = z.object({
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  slipFawda: z.string().max(2000).optional(),
  didWell: z.string().max(2000).optional(),
  nextFocus: z.string().max(2000).optional(),
  gratitude: z.string().max(2000).optional(),
  isShared: z.boolean().optional().default(true),
});

// ─── Circle Clips ────────────────────────────────────
export const postClipSchema = z.object({
  videoUrl: z.string().url("Must be a valid URL"),
  title: z.string().max(200).optional(),
  caption: z.string().max(1000).optional(),
});

export const updateRotationSchema = z.object({
  intervalDays: z.number().int().min(1).max(14).optional(),
});

// ─── Pillar Journal (Shared Blog Post) ───────────────
export const pillarJournalSchema = z.object({
  pillar: z.enum(["deen", "body", "mind", "mission", "brotherhood"]),
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(10000),
});

export const getJournalsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pillar: z.enum(["deen", "body", "mind", "mission", "brotherhood"]).optional(),
});
