import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classifyDecision, confirmDecision, decisionChain, loadDecisionRecords, previewDecision, queryDecisions } from "../decisions/index.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "decisionguard-decisions-test-"));
  const records = join(root, ".decisions", "records");
  mkdirSync(records, { recursive: true });
  writeFileSync(join(records, "0001-redis.md"), `# DR-0001: Redis for shared counters

**Date**: 2026-08-31
**Category**: architecture
**Status**: accepted
**Weight**: heavy

## Context

Rate limits must be consistent across replicas.

## Decision

Use Redis for shared counters.

## Alternatives Considered

- In-memory counters — diverge across replicas

## Relationships

- (none)

## Review Trigger

Revisit at single-replica deployment.
`);
  writeFileSync(join(records, "0002-rate-limit.md"), `# DR-0002: Sliding-window rate limiter

**Date**: 2026-08-31
**Category**: performance
**Status**: accepted
**Weight**: standard

## Why

Token bucket permits bursts.

## What

Use a sliding-window limiter backed by Redis.

## Alternatives Skipped

- Token bucket — permits bursts

## Relationships

- depends-on: DR-0001
`);
  return root;
}

describe("merged decision memory", () => {
  it("parses records and expands the dependency graph", () => {
    const root = fixture();
    const records = loadDecisionRecords(root);
    const chain = decisionChain(records, "dr-0001");
    expect(records).toHaveLength(2);
    expect(chain?.blastRadius.map((record) => record.id)).toEqual(["DR-0002"]);
  });

  it("returns direct decisions and graph-related decisions", () => {
    const root = fixture();
    const results = queryDecisions(loadDecisionRecords(root), "remove Redis in-memory rate limiting", 1);
    expect(results[0].id).toBe("DR-0001");
    expect(results.some((result) => result.id === "DR-0002" && result.surfacedVia === "relationship")).toBe(true);
  });

  it("enforces the two-phase heavy decision flow", () => {
    const root = fixture();
    expect(classifyDecision("replace the shared database for lower cost").weight).toBe("heavy");
    const preview = previewDecision(root, "replace Redis with in-memory counters");
    const missingAlternatives = confirmDecision({ root, description: "replace Redis with in-memory counters", confirmed: true, token: preview.token });
    expect(missingAlternatives.written).toBe(false);
    const secondPreview = missingAlternatives.preview || previewDecision(root, "replace Redis with in-memory counters");
    const result = confirmDecision({ root, description: "replace Redis with in-memory counters", confirmed: true, token: secondPreview.token, alternatives: ["Keep Redis — preserves cross-replica consistency"] });
    expect(result.written).toBe(true);
    expect(readFileSync(result.filePath!, "utf8")).toContain("Keep Redis");
  });
});

