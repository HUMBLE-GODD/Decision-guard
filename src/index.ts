import express from "express";
import cors from "cors";
import "dotenv/config";
import { join } from "node:path";
import { initDatabase } from "./db/index.js";
import { searchRouter } from "./api/search.js";
import { recallRouter } from "./api/recall.js";
import { ingestRouter } from "./api/ingest.js";
import { healthRouter } from "./api/health.js";
import { reconsolidateRouter } from "./api/reconsolidate.js";
import { proceduralRouter } from "./api/procedural.js";
import { graphRouter } from "./api/graph.js";
import { dreamRouter } from "./api/dream.js";
import { decisionsRouter } from "./api/decisions.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3100", 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(join(process.cwd(), "public"), { index: false }));

// Routes
app.use("/api/v1/search", searchRouter);
app.use("/api/v1/recall", recallRouter);
app.use("/api/v1/ingest", ingestRouter);
app.use("/api/v1/reconsolidate", reconsolidateRouter);
app.use("/api/v1/procedural", proceduralRouter);
app.use("/api/v1/graph", graphRouter);
app.use("/api/v1/dream", dreamRouter);
app.use("/api/v1/decisions", decisionsRouter);
app.use("/api/v1", healthRouter);

// Dashboard
app.get("/", (_req, res) => {
  res.sendFile(join(process.cwd(), "public/index.html"));
});

// Start
async function start() {
  try {
    await initDatabase();
    console.log("[decisionguard] Database connected");
  } catch (err) {
    console.error("[decisionguard] Database connection failed:", err);
    console.log("[decisionguard] Starting without database — some endpoints will fail");
  }

  app.listen(PORT, () => {
    console.log(`[decisionguard] DECISIONGUARD V2 running on http://localhost:${PORT}`);
  });
}

start();

export default app;
