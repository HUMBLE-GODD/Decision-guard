import { randomBytes } from "node:crypto";
import { applySupersedes, writeDecision, writeDeferredDecision, type DecisionWriteInput } from "./writer.js";
import { classifyDecision, type ClassificationResult } from "./classifier.js";
import { loadDecisionRecords } from "./parser.js";
import { queryDecisions } from "./retrieval.js";
import type { DecisionRelationship } from "./types.js";

const tokens = new Map<string, string>();

export interface DecisionPreview {
  classification: ClassificationResult;
  token: string;
  related: ReturnType<typeof queryDecisions>;
}

export function previewDecision(root: string, description: string): DecisionPreview {
  const classification = classifyDecision(description);
  const token = randomBytes(8).toString("hex");
  tokens.set(token, description);
  while (tokens.size > 100) tokens.delete(tokens.keys().next().value as string);
  return { classification, token, related: queryDecisions(loadDecisionRecords(root), description, 5) };
}

export interface ConfirmDecisionInput {
  root: string;
  description: string;
  token?: string;
  confirmed?: boolean;
  weight?: ClassificationResult["weight"];
  category?: string;
  title?: string;
  why?: string;
  tradeOff?: string;
  reviewTrigger?: string;
  relationships?: DecisionRelationship[];
  alternatives?: string[];
}

export interface ConfirmDecisionResult {
  written: boolean;
  message: string;
  filePath?: string;
  preview?: DecisionPreview;
}

export function confirmDecision(input: ConfirmDecisionInput): ConfirmDecisionResult {
  const classification = classifyDecision(input.description);
  if (input.weight) classification.weight = input.weight;
  if (input.category) classification.category = input.category;
  if (classification.weight === "skip") return { written: false, message: "Implementation-level decision — not worth recording." };
  if (!input.confirmed || !input.token || tokens.get(input.token) !== input.description) {
    const preview = previewDecision(input.root, input.description);
    return { written: false, message: input.confirmed ? "Confirmation token is missing, invalid, or stale." : "Phase 1 preview complete; confirm with the returned token.", preview };
  }
  tokens.delete(input.token);
  if (classification.weight === "heavy" && !(input.alternatives || []).length) {
    return { written: false, message: "Heavy decisions require documented alternatives." };
  }

  const relationships = input.relationships || [];
  const records = loadDecisionRecords(input.root);
  const knownIds = new Set(records.map((record) => record.id));
  const invalid = relationships.filter((relationship) => !knownIds.has(relationship.target));
  if (invalid.length) return { written: false, message: `Unknown relationship target(s): ${invalid.map((item) => item.target).join(", ")}` };

  const writeInput: DecisionWriteInput = { description: input.description, classification, title: input.title, why: input.why, tradeOff: input.tradeOff, reviewTrigger: input.reviewTrigger, relationships, alternatives: input.alternatives };
  if (classification.weight === "deferred") {
    const filePath = writeDeferredDecision(input.root, input.description, input.why, input.reviewTrigger);
    return { written: true, message: "Deferred decision recorded.", filePath };
  }
  const filePath = writeDecision(input.root, writeInput);
  const newId = `DR-${filePath.match(/(\d{4})-/)?.[1] || "????"}`;
  for (const relationship of relationships) if (relationship.type === "supersedes") applySupersedes(input.root, newId, relationship.target);
  return { written: true, message: "Decision record written.", filePath };
}

export function formatDecisionPreview(preview: DecisionPreview): string {
  const lines = [
    `Classification: ${preview.classification.weight} | ${preview.classification.category || "N/A"}`,
    `Reason: ${preview.classification.reason}`,
    "",
  ];
  if (preview.related.length) {
    lines.push("Related decisions:");
    for (const result of preview.related) lines.push(`- ${result.id} [${result.surfacedVia}] ${result.title}`);
    lines.push("");
  }
  lines.push(`Confirm with confirmed=true and token=\"${preview.token}\".`);
  return lines.join("\n");
}

