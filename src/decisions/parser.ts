import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { AnyDecisionRecord, DecisionRecord, DeferredRecord, DecisionRelationship } from "./types.js";

function field(content: string, name: string, fallback = ""): string {
  const match = content.match(new RegExp(`\\*\\*${name}\\*\\*:\\s*(.+)`));
  return match?.[1]?.trim() || fallback;
}

function section(content: string, names: string[]): string {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => wanted.has(line.replace(/^##\s+/, "").trim().toLowerCase()));
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
  return lines.slice(start + 1, end < 0 ? lines.length : end).join("\n").trim();
}

function bullets(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/)?.[1]?.trim() || "")
    .filter((line) => line.length > 0 && !/^because\b/i.test(line));
}

function relationships(content: string): DecisionRelationship[] {
  const body = section(content, ["Relationships"]);
  const explicit = body
    .split("\n")
    .map((line) => line.match(/^\s*[-*]\s*(overrides|inferred-by|depends-on|supersedes|conflicts-with|references):\s*(DR-\d+)\s*$/i))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ type: match[1].toLowerCase(), target: match[2].toUpperCase() }));

  const prose = section(content, ["Why", "What", "Context", "Decision"]);
  const explicitTargets = new Set(explicit.map((item) => item.target));
  for (const target of prose.match(/\bDR-\d{4}\b/g) || []) {
    const normalized = target.toUpperCase();
    if (!explicitTargets.has(normalized)) explicit.push({ type: "references", target: normalized });
  }
  return explicit;
}

function parseRecord(filePath: string, root: string): DecisionRecord | null {
  const content = readFileSync(filePath, "utf8");
  const heading = content.match(/^# (DR-\d+):\s*(.+)$/m);
  if (!heading) return null;

  const id = heading[1].toUpperCase();
  const record: DecisionRecord = {
    id,
    title: heading[2].trim(),
    category: field(content, "Category", "architectural"),
    status: field(content, "Status", "proposed"),
    weight: (field(content, "Weight", "standard") as DecisionRecord["weight"]),
    date: field(content, "Date"),
    filePath: relative(root, filePath),
    content,
    why: section(content, ["Why", "Context"]).replace(/\s+/g, " ").trim(),
    decision: section(content, ["What", "Decision"]).replace(/\s+/g, " ").trim(),
    tradeOff: section(content, ["Trade-off", "Consequences"]).replace(/\s+/g, " ").trim(),
    alternatives: bullets(section(content, ["Alternatives Skipped", "Alternatives Considered"])),
    consequences: bullets(section(content, ["Consequences"])),
    reviewTrigger: section(content, ["Review Trigger"]).replace(/\s+/g, " ").trim(),
    relationships: relationships(content),
  };
  return record;
}

function parseDeferred(root: string): DeferredRecord[] {
  const filePath = join(root, ".decisions", "deferred.md");
  try { statSync(filePath); } catch { return []; }
  const content = readFileSync(filePath, "utf8");
  const headings = [...content.matchAll(/^## (\d{4}-\d{2}-\d{2}) — (.+)$/gm)];
  return headings.map((heading, index) => {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? content.length;
    const block = content.slice(start, end);
    return {
      id: `DEF-${String(index + 1).padStart(4, "0")}`,
      title: heading[2].trim(),
      date: heading[1],
      filePath: relative(root, filePath),
      status: "deferred" as const,
      weight: "deferred" as const,
      category: "" as const,
      content: block.trim(),
      why: field(block, "Why deferred", "Not documented"),
      decision: field(block, "What was deferred", heading[2].trim()),
      tradeOff: field(block, "Risk of deferral", "Not documented"),
      alternatives: [],
      consequences: [],
      reviewTrigger: field(block, "Review trigger", "Not specified"),
      relationships: [],
    };
  });
}

export function loadDecisionRecords(root: string): AnyDecisionRecord[] {
  const recordsDir = join(root, ".decisions", "records");
  let files: string[] = [];
  try { files = readdirSync(recordsDir).filter((name) => name.endsWith(".md")).sort().map((name) => join(recordsDir, name)); } catch { /* empty corpus */ }
  const records = files.map((filePath) => parseRecord(filePath, root)).filter((record): record is DecisionRecord => Boolean(record));
  return [...records, ...parseDeferred(root)].sort((a, b) => a.id.localeCompare(b.id));
}
