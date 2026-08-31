import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { ingestFile } from "../ingestion/ingest-markdown.js";
import { loadDecisionRecords } from "./parser.js";

export async function syncDecisionsToMemory(root: string, agentExternalId: string): Promise<{ records: number; chunks: number }> {
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.externalId, agentExternalId));
  if (!agent) throw new Error(`Agent '${agentExternalId}' not found`);

  let chunks = 0;
  let records = 0;
  const syncedPaths = new Set<string>();
  for (const record of loadDecisionRecords(root)) {
    if (!record.filePath.endsWith(".md")) continue;
    if (syncedPaths.has(record.filePath)) continue;
    syncedPaths.add(record.filePath);
    const absolutePath = join(root, record.filePath);
    chunks += await ingestFile({
      agentId: agent.id,
      sourcePath: absolutePath,
      sourceType: "decision_record",
      priority: record.weight === "heavy" ? 0 : record.weight === "deferred" ? 1 : 2,
    });
    records++;
  }
  return { records, chunks };
}
