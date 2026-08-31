import { defineConfig } from "drizzle-kit";
import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL!;
const isHostedPostgres = databaseUrl.includes("neon.tech") || databaseUrl.includes("supabase.com");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
    ...(isHostedPostgres ? { ssl: "require" } : {}),
  },
});
