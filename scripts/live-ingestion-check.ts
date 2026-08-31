import "dotenv/config";
import { writeFileSync, unlinkSync } from "node:fs";
import { db, schema, closeDatabase, initDatabase } from "../src/db/index.js";
import { ingestFile } from "../src/ingestion/ingest-markdown.js";
import { hybridSearch } from "../src/api/search.js";
import { eq } from "drizzle-orm";

const sourcePath = "/tmp/decisionguard-live-ingestion.md";
const externalId = "decisionguard-live-check";

await initDatabase();

let [agent] = await db
  .select()
  .from(schema.agents)
  .where(eq(schema.agents.externalId, externalId));

if (!agent) {
  [agent] = await db
    .insert(schema.agents)
    .values({
      externalId,
      name: "DecisionGuard Live Check",
      ownerId: "decisionguard",
    })
    .returning();
}

writeFileSync(
  sourcePath,
  `# DecisionGuard live ingestion check\n\nThe release process requires a staged approval before production deployment. The incident owner must verify the rollback plan and record the decision.\n`
);

let exitCode = 0;

try {
  const ingestedChunks = await ingestFile({
    agentId: agent.id,
    sourcePath,
    sourceType: "live-check",
    priority: 1,
  });
  const results = await hybridSearch(
    agent.id,
    "What approval is required before production deployment?",
    5
  );

  if (ingestedChunks < 1 || results.length < 1) {
    throw new Error(
      `Expected at least one ingested chunk and search result; got ${ingestedChunks} and ${results.length}`
    );
  }

  console.log(
    JSON.stringify(
      {
        ollama: { ok: true, model: process.env.EMBEDDING_MODEL || "mxbai-embed-large" },
        ingestion: { ok: true, chunks: ingestedChunks },
        retrieval: {
          ok: true,
          results: results.slice(0, 3).map((result) => ({
            id: result.id,
            score: Number(result.score.toFixed(4)),
            content: result.content,
          })),
        },
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  unlinkSync(sourcePath);
  await closeDatabase();
}

process.exit(exitCode);
