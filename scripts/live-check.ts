import "dotenv/config";
import postgres from "postgres";
import { llmComplete } from "../src/lib/llm.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

const sql = postgres(databaseUrl, {
  connect_timeout: 15,
  ...(databaseUrl.includes("supabase.com") ? { ssl: "require" as const } : {}),
});

try {
  const rows = await sql`select current_database() as database, exists(select 1 from pg_extension where extname = 'vector') as has_vector`;
  const llm = await llmComplete([{ role: "user", content: "Reply with exactly: DecisionGuard Groq OK" }], { maxTokens: 16, temperature: 0 });
  if (!llm.content.trim()) throw new Error("Groq returned an empty response");
  console.log(JSON.stringify({
    database: { ok: true, database: rows[0]?.database, hasVector: rows[0]?.has_vector },
    groq: { ok: true, model: llm.model, response: llm.content },
  }, null, 2));
} finally {
  await sql.end();
}
