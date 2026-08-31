import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ClassificationResult } from "./classifier.js";
import type { DecisionRelationship } from "./types.js";

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

function nextId(root: string): string {
  const directory = join(root, ".decisions", "records");
  mkdirSync(directory, { recursive: true });
  const ids = requireRecordNames(directory).map((name) => Number(name.slice(0, 4))).filter(Number.isFinite);
  return String((ids.length ? Math.max(...ids) + 1 : 1)).padStart(4, "0");
}

function requireRecordNames(directory: string): string[] {
  try {
    return readdirSync(directory).filter((name) => /^\d{4}-/.test(name));
  } catch {
    return [];
  }
}

function relationshipsBlock(relationships: DecisionRelationship[]): string {
  return relationships.length ? relationships.map((relationship) => `- ${relationship.type}: ${relationship.target}`).join("\n") : "- (none)";
}

function alternativesBlock(alternatives: string[], fallback: string): string {
  return alternatives.length ? alternatives.map((alternative) => `- ${alternative}`).join("\n") : fallback;
}

export interface DecisionWriteInput {
  description: string;
  classification: ClassificationResult;
  title?: string;
  why?: string;
  tradeOff?: string;
  relationships?: DecisionRelationship[];
  alternatives?: string[];
  reviewTrigger?: string;
}

export function writeDecision(root: string, input: DecisionWriteInput): string {
  const id = nextId(root);
  const title = (input.title || input.description.slice(0, 60)).trim();
  const relationships = input.relationships || [];
  const alternatives = input.alternatives || [];
  const date = new Date().toISOString().slice(0, 10);
  const directory = join(root, ".decisions", "records");
  const filePath = join(directory, `${id}-${slug(title)}.md`);
  const heavy = input.classification.weight === "heavy";
  const content = heavy
    ? `# DR-${id}: ${title}\n\n**Date**: ${date}\n**Category**: ${input.classification.category || "architectural"}\n**Status**: accepted\n**Weight**: heavy\n\n## Context\n\n${input.why || input.description}\n\n## Decision\n\n${input.description}\n\n## Alternatives Considered\n\n${alternativesBlock(alternatives, "_No alternatives documented._")}\n\n## Consequences\n\n### Positive\n- To be documented\n\n### Negative / Trade-offs\n- ${input.tradeOff || "Not documented"}\n\n### Risks\n- None identified\n\n## Relationships\n\n${relationshipsBlock(relationships)}\n\n## Review Trigger\n\n${input.reviewTrigger || "Not specified"}\n`
    : `# DR-${id}: ${title}\n\n**Date**: ${date}\n**Category**: ${input.classification.category || "architectural"}\n**Status**: accepted\n**Weight**: standard\n\n## Why\n\n${input.why || input.description}\n\n## What\n\n${input.description}\n\n## Trade-off\n\n${input.tradeOff || "Not documented"}\n\n## Alternatives Skipped\n\n${alternativesBlock(alternatives, "_See description above._")}\n\n## Relationships\n\n${relationshipsBlock(relationships)}\n`;
  writeFileSync(filePath, content, { encoding: "utf8", flag: "wx" });
  return filePath;
}

export function writeDeferredDecision(root: string, description: string, why?: string, reviewTrigger?: string): string {
  const directory = join(root, ".decisions");
  mkdirSync(directory, { recursive: true });
  const filePath = join(directory, "deferred.md");
  const date = new Date().toISOString().slice(0, 10);
  appendFileSync(filePath, `\n---\n\n## ${date} — ${description.slice(0, 60)}\n\n**What was deferred**: ${description}\n**Why deferred**: ${why || "Not documented"}\n**Review trigger**: ${reviewTrigger || "Not specified"}\n**Risk of deferral**: Not documented\n`, "utf8");
  return filePath;
}

export function applySupersedes(root: string, newId: string, targetId: string): boolean {
  const directory = join(root, ".decisions", "records");
  const targetNumber = targetId.replace(/^DR-/, "").padStart(4, "0");
  const filePath = requireRecordNames(directory).map((name) => join(directory, name)).find((candidate) => basename(candidate).startsWith(`${targetNumber}-`));
  if (!filePath) return false;
  const content = readFileSync(filePath, "utf8");
  const updated = content.replace(/(\*\*Status\*\*:\s*).*/m, `$1superseded by ${newId}`);
  if (updated === content) return false;
  writeFileSync(filePath, updated, "utf8");
  return true;
}
