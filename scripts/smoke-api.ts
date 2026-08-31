import express from "express";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { decisionsRouter } from "../src/api/decisions.js";

const root = mkdtempSync(join(tmpdir(), "decisionguard-api-smoke-"));
const records = join(root, ".decisions", "records");
mkdirSync(records, { recursive: true });
writeFileSync(join(records, "0001-shared-state.md"), `# DR-0001: Shared state for replicas

**Date**: 2026-08-31
**Category**: architecture
**Status**: accepted
**Weight**: heavy

## Context

Replicas must agree on rate limits.

## Decision

Use Redis for shared state.

## Alternatives Considered

- Local memory — replicas diverge

## Relationships

- (none)

## Review Trigger

Single-replica deployment.
`);
writeFileSync(join(records, "0002-rate-limit.md"), `# DR-0002: Rate limiter

**Date**: 2026-08-31
**Category**: performance
**Status**: accepted
**Weight**: standard

## Why

Limit abusive traffic.

## What

Use Redis-backed sliding windows.

## Relationships

- depends-on: DR-0001
`);

process.env.DECISIONGUARD_WORKSPACE = root;
const app = express();
app.use(express.json());
app.use("/api/v1/decisions", decisionsRouter);
const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => resolve(app.listen(0)));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Smoke server did not bind to a port");
const base = `http://127.0.0.1:${address.port}`;
const query = await fetch(`${base}/api/v1/decisions/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "remove Redis for rate limiting", topN: 1 }) });
const queryBody = await query.json() as { results: Array<{ id: string; surfacedVia: string }> };
const chain = await fetch(`${base}/api/v1/decisions/DR-0001/chain`);
const chainBody = await chain.json() as { blastRadius: Array<{ id: string }> };
server.close();

if (query.status !== 200 || queryBody.results[0]?.id !== "DR-0001" || !queryBody.results.some((result) => result.id === "DR-0002" && result.surfacedVia === "relationship") || chain.status !== 200 || chainBody.blastRadius[0]?.id !== "DR-0002") {
  throw new Error(`HTTP smoke test failed: ${JSON.stringify({ query: queryBody, chain: chainBody })}`);
}

console.log(JSON.stringify({ status: "ok", queryResult: queryBody.results, blastRadius: chainBody.blastRadius }, null, 2));

