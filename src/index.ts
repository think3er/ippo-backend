import express from "express";
import cors from "cors";
import { execSync } from "child_process";
import authRoutes from "./routes/auth";
import circleRoutes from "./routes/circles";
import checkInRoutes from "./routes/checkins";
import clipRoutes from "./routes/clips";
import journalRoutes from "./routes/journals";
import notificationRoutes from "./routes/notifications";
import mealRoutes from "./routes/meals";

// Run migrations on startup
try {
  console.log("Running prisma db push...");
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  console.log("Database schema synced!");
} catch (err) {
  console.error("Migration failed:", err);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/auth", authRoutes);
app.use("/circles", circleRoutes);
app.use("/circles", checkInRoutes);
app.use("/circles", clipRoutes);
app.use("/circles", journalRoutes);
app.use("/circles", mealRoutes);
app.use("/notifications", notificationRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Ippo API running on port ${PORT}`);
});
