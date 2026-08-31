import type { AnyDecisionRecord, DecisionSearchResult } from "./types.js";
import { buildReverseLinks } from "./graph.js";

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
}

function recordText(record: AnyDecisionRecord): string {
  return [record.title, record.category, record.why, record.decision, record.tradeOff, ...record.alternatives].join(" ");
}

export function queryDecisions(records: AnyDecisionRecord[], query: string, topN = 5): DecisionSearchResult[] {
  const queryTokens = tokens(query);
  if (!queryTokens.size) return [];
  const reverse = buildReverseLinks(records);
  const scored = records.map((record) => {
    const textTokens = tokens(recordText(record));
    const matches = [...queryTokens].filter((token) => textTokens.has(token)).length;
    const phraseBonus = recordText(record).toLowerCase().includes(query.toLowerCase()) ? 0.25 : 0;
    const liveBonus = ["accepted", "proposed", "deferred"].includes(record.status) ? 0.05 : 0;
    const score = queryTokens.size ? matches / queryTokens.size + phraseBonus + liveBonus : 0;
    return { record, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, topN);

  const results: DecisionSearchResult[] = scored.map(({ record, score }) => ({
    id: record.id,
    title: record.title,
    score,
    surfacedVia: "direct",
    status: record.status,
    weight: record.weight,
    category: record.category,
    why: record.why,
    alternatives: record.alternatives,
    dependsOn: record.relationships.filter((r) => r.type === "depends-on").map((r) => r.target),
    filePath: record.filePath,
    relevanceNote: `Keyword relevance: ${score.toFixed(3)}`,
  }));
  const seen = new Set(results.map((result) => result.id));
  for (const result of [...results]) {
    const source = records.find((record) => record.id === result.id);
    if (!source) continue;
    const relatedIds = [
      ...source.relationships.map((relationship) => relationship.target),
      ...(reverse.get(source.id) || []).map((relationship) => relationship.target),
    ];
    for (const relatedId of relatedIds) {
      if (seen.has(relatedId)) continue;
      const related = records.find((record) => record.id === relatedId);
      if (!related) continue;
      seen.add(relatedId);
      const relationship = source.relationships.find((item) => item.target === relatedId) || (reverse.get(source.id) || []).find((item) => item.target === relatedId);
      results.push({
        id: related.id,
        title: related.title,
        score: 0,
        surfacedVia: "relationship",
        relationshipType: relationship?.type,
        status: related.status,
        weight: related.weight,
        category: related.category,
        why: related.why,
        alternatives: related.alternatives,
        dependsOn: related.relationships.filter((r) => r.type === "depends-on").map((r) => r.target),
        filePath: related.filePath,
        relevanceNote: `Related to ${source.id}`,
      });
    }
  }
  return results;
}

