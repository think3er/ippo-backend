import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import circleRoutes from "./routes/circles";
import checkInRoutes from "./routes/checkins";
import clipRoutes from "./routes/clips";
import journalRoutes from "./routes/journals";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/auth", authRoutes);
app.use("/circles", circleRoutes);
app.use("/circles", checkInRoutes);
app.use("/circles", clipRoutes);
app.use("/circles", journalRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Sahwa API running on port ${PORT}`);
});
