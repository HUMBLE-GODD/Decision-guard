import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { decisionChain, formatDecisionPreview, loadDecisionRecords, previewDecision, queryDecisions, confirmDecision } from "../src/decisions/index.js";

const root = mkdtempSync(join(tmpdir(), "decisionguard-decision-safety-demo-"));
const records = join(root, ".decisions", "records");
mkdirSync(records, { recursive: true });

const write = (name: string, content: string) => writeFileSync(join(records, name), content, "utf8");
write("0001-redis-shared-state.md", `# DR-0001: Redis for shared coordination state

**Date**: 2026-08-31
**Category**: architecture
**Status**: accepted
**Weight**: heavy

## Context

Checkout runs on multiple replicas. Rate limits and job claims must agree across replicas.

## Decision

Use Redis for shared counters and distributed coordination.

## Alternatives Considered

- In-memory counters — each replica would enforce a different limit
- Database row locks — too much contention at checkout traffic levels

## Relationships

- (none)

## Review Trigger

Revisit only if the service becomes single-replica.
`);
write("0002-rate-limiter.md", `# DR-0002: Sliding-window rate limiter

**Date**: 2026-08-31
**Category**: performance
**Status**: accepted
**Weight**: standard

## Why

Token bucket allows bursts at the window boundary.

## What

Use a sliding-window limiter backed by Redis.

## Alternatives Skipped

- Token bucket — permits boundary bursts

## Relationships

- depends-on: DR-0001
`);
write("0003-job-lock.md", `# DR-0003: Distributed job claim lock

**Date**: 2026-08-31
**Category**: reliability
**Status**: accepted
**Weight**: heavy

## Context

Only one checkout worker may claim a payment job.

## Decision

Use Redis-backed locking for job claims.

## Alternatives Considered

- Local process locks — do not coordinate across replicas

## Relationships

- depends-on: DR-0001
`);

console.log("\n=== DECISIONGUARD Decision Safety Demo ===");
console.log(`Workspace: ${root}`);
const query = "replace Redis with in-memory rate limiting to reduce infrastructure cost";
console.log(`\n> Preflight: ${query}`);
const results = queryDecisions(loadDecisionRecords(root), query, 1);
for (const result of results) console.log(`  ${result.surfacedVia === "direct" ? "DIRECT" : "RELATED"} ${result.id}: ${result.title}${result.why ? ` — ${result.why}` : ""}`);

const chain = decisionChain(loadDecisionRecords(root), "DR-0001");
console.log("\n> Blast radius of changing DR-0001:");
for (const record of chain?.blastRadius || []) console.log(`  - ${record.id}: ${record.title}`);

const description = "Replace Redis with in-memory rate limiting to reduce infrastructure cost";
const preview = previewDecision(root, description);
console.log("\n> Decision logging phase 1:");
console.log(formatDecisionPreview(preview));
const confirmed = confirmDecision({ root, description, confirmed: true, token: preview.token, alternatives: ["Keep Redis — preserves consistency across replicas", "Database locks — too much contention for checkout traffic"], why: "The service is distributed and rate limits must remain consistent.", tradeOff: "Retains Redis operational cost.", relationships: [{ type: "depends-on", target: "DR-0001" }] });
console.log("\n> Decision logging phase 2:");
console.log(`  ${confirmed.message} ${confirmed.filePath}`);
console.log("\nRESULT: risky dependency removal was surfaced, its blast radius was explained, and the safer decision was recorded.");

