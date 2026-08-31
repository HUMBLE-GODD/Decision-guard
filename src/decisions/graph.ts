import type { AnyDecisionRecord, DecisionChain, DecisionRelationship } from "./types.js";

const inverse: Record<string, string> = {
  "depends-on": "depended-on-by",
  supersedes: "superseded-by",
  "conflicts-with": "conflicts-with",
  overrides: "overridden-by",
  "inferred-by": "infers",
};

export function buildReverseLinks(records: AnyDecisionRecord[]): Map<string, DecisionRelationship[]> {
  const reverse = new Map<string, DecisionRelationship[]>();
  for (const record of records) reverse.set(record.id, []);
  for (const record of records) {
    for (const relationship of record.relationships) {
      if (!reverse.has(relationship.target)) continue;
      reverse.get(relationship.target)?.push({ type: inverse[relationship.type] || "linked-from", target: record.id });
    }
  }
  return reverse;
}

export function decisionChain(records: AnyDecisionRecord[], id: string, maxDepth = 12): DecisionChain | null {
  const normalized = id.toUpperCase();
  const byId = new Map(records.map((record) => [record.id, record]));
  const root = byId.get(normalized);
  if (!root) return null;
  const reverse = buildReverseLinks(records);
  const dependsOn: AnyDecisionRecord[] = [];
  const blastRadius: AnyDecisionRecord[] = [];
  const danglingReferences: string[] = [];

  const walk = (start: string, output: AnyDecisionRecord[], next: (record: AnyDecisionRecord) => string[], visited: Set<string>, depth: number) => {
    if (depth > maxDepth || visited.has(start)) return;
    visited.add(start);
    const record = byId.get(start);
    if (!record) { danglingReferences.push(start); return; }
    output.push(record);
    for (const nextId of next(record)) walk(nextId, output, next, visited, depth + 1);
  };

  const dependencyIds = (record: AnyDecisionRecord) => record.relationships.filter((r) => r.type === "depends-on").map((r) => r.target);
  const dependentIds = (record: AnyDecisionRecord) => (reverse.get(record.id) || [])
    .filter((r) => ["depended-on-by", "overridden-by", "superseded-by"].includes(r.type))
    .map((r) => r.target);

  for (const relationship of root.relationships) {
    if (!byId.has(relationship.target)) danglingReferences.push(relationship.target);
  }
  for (const id of dependencyIds(root)) walk(id, dependsOn, dependencyIds, new Set([root.id]), 1);
  for (const id of dependentIds(root)) walk(id, blastRadius, dependentIds, new Set([root.id]), 1);

  return { root, dependsOn: dependsOn.filter((record) => record.id !== root.id), blastRadius: blastRadius.filter((record) => record.id !== root.id), danglingReferences: [...new Set(danglingReferences)] };
}

