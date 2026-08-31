import type { DecisionWeight } from "./types.js";

export interface ClassificationResult {
  weight: DecisionWeight;
  category: string | null;
  reason: string;
}

const HEAVY_CATEGORIES = new Set(["architectural", "security", "compliance", "cost", "domain"]);

export function classifyDecision(description: string): ClassificationResult {
  const lower = description.toLowerCase();

  if (/\b(variable name|file name|formatting|split function|helper location)\b/.test(lower)) {
    return { weight: "skip", category: null, reason: "Implementation-level detail" };
  }

  if (/\b(skip for now|revisit later|post-mvp|hold off|consciously not deciding|not deciding yet|choosing not to decide)\b/.test(lower)) {
    return { weight: "deferred", category: null, reason: "Explicit deferral detected" };
  }

  let category = "architectural";
  const patterns: Array<[RegExp, string]> = [
    [/\b(auth|authentication|authoriz|encrypt|secret|credential|trust|permission)\b/, "security"],
    [/\b(gdpr|compliance|legal|regulation|residency|retention|policy)\b/, "compliance"],
    [/\b(cost|budget|license|pricing|build vs buy)\b/, "cost"],
    [/\b(schema|migration|database|storage|table|index|data model)\b/, "data"],
    [/\b(api|rest|graphql|endpoint|contract|versioning|interface)\b/, "api"],
    [/\b(performance|cache|latency|throughput|async|scale)\b/, "performance"],
    [/\b(package|dependency|library|pip|npm|yarn|upgrade|remove)\b/, "dependency"],
    [/\b(test|coverage|e2e|unit|integration|mock)\b/, "testing"],
    [/\b(error|exception|retry|fallback|alert|log)\b/, "error-handling"],
    [/\b(state|client state|server state|cache invalidation)\b/, "state"],
    [/\b(naming|convention|ubiquitous language)\b/, "naming"],
    [/\b(deploy|observability|rollback|monitoring|ci|cd|prod)\b/, "operational"],
    [/\b(aggregate|entity|domain model|bounded context)\b/, "domain"],
    [/\b(team|owner|ownership|responsibility)\b/, "team"],
    [/\b(ux|ui|user flow|interaction|product)\b/, "ux-product"],
  ];

  for (const [pattern, candidate] of patterns) {
    if (pattern.test(lower)) {
      category = candidate;
      break;
    }
  }

  const heavy = HEAVY_CATEGORIES.has(category) ||
    /\b(multiple services|significant rework|irreversible|compliance|legal|cost commitment|serious mistake)\b/.test(lower);

  return {
    weight: heavy ? "heavy" : "standard",
    category,
    reason: `Auto-classified as ${category} (${heavy ? "heavy" : "standard"})`,
  };
}

