import { Router, type Request, type Response } from "express";
import {
  classifyDecision,
  confirmDecision,
  decisionChain,
  formatDecisionPreview,
  loadDecisionRecords,
  previewDecision,
  queryDecisions,
  syncDecisionsToMemory,
} from "../decisions/index.js";

const router = Router();
const root = () => process.env.DECISIONGUARD_WORKSPACE || process.cwd();

router.get("/", (_req: Request, res: Response) => {
  res.json({ records: loadDecisionRecords(root()) });
});

router.post("/query", (req: Request, res: Response) => {
  const { query, topN = 5 } = req.body as { query?: string; topN?: number };
  if (!query) { res.status(400).json({ error: "query is required" }); return; }
  res.json({ query, results: queryDecisions(loadDecisionRecords(root()), query, topN) });
});

router.post("/classify", (req: Request, res: Response) => {
  const { description } = req.body as { description?: string };
  if (!description) { res.status(400).json({ error: "description is required" }); return; }
  res.json(classifyDecision(description));
});

router.post("/preview", (req: Request, res: Response) => {
  const { description } = req.body as { description?: string };
  if (!description) { res.status(400).json({ error: "description is required" }); return; }
  const preview = previewDecision(root(), description);
  res.json({ ...preview, formatted: formatDecisionPreview(preview) });
});

router.post("/log", (req: Request, res: Response) => {
  const body = req.body as Parameters<typeof confirmDecision>[0];
  if (!body.description) { res.status(400).json({ error: "description is required" }); return; }
  const result = confirmDecision({ ...body, root: root() });
  res.status(result.written ? 201 : 200).json(result);
});

router.post("/sync", async (req: Request, res: Response) => {
  const { agentId } = req.body as { agentId?: string };
  if (!agentId) { res.status(400).json({ error: "agentId is required" }); return; }
  try {
    res.json({ agentId, ...(await syncDecisionsToMemory(root(), agentId)) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Decision sync failed" });
  }
});

router.get("/:id/chain", (req: Request, res: Response) => {
  const id = String(req.params.id);
  const chain = decisionChain(loadDecisionRecords(root()), id);
  if (!chain) { res.status(404).json({ error: `Decision '${id}' not found` }); return; }
  res.json(chain);
});

export { router as decisionsRouter };
