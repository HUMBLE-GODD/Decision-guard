export type DecisionWeight = "heavy" | "standard" | "deferred" | "skip";

export type DecisionStatus = "accepted" | "proposed" | "deferred" | string;

export interface DecisionRelationship {
  type: string;
  target: string;
}

export interface DecisionRecord {
  id: string;
  title: string;
  category: string;
  status: DecisionStatus;
  weight: DecisionWeight;
  date: string;
  filePath: string;
  content: string;
  why: string;
  decision: string;
  tradeOff: string;
  alternatives: string[];
  consequences: string[];
  reviewTrigger: string;
  relationships: DecisionRelationship[];
}

export interface DeferredRecord {
  id: string;
  title: string;
  date: string;
  filePath: string;
  status: "deferred";
  weight: "deferred";
  category: "";
  content: string;
  why: string;
  decision: string;
  tradeOff: string;
  alternatives: string[];
  consequences: string[];
  reviewTrigger: string;
  relationships: DecisionRelationship[];
}

export type AnyDecisionRecord = DecisionRecord | DeferredRecord;

export interface DecisionSearchResult {
  id: string;
  title: string;
  score: number;
  surfacedVia: "direct" | "relationship";
  relationshipType?: string;
  status: string;
  weight: string;
  category: string;
  why: string;
  alternatives: string[];
  dependsOn: string[];
  filePath: string;
  relevanceNote: string;
}

export interface DecisionChain {
  root: AnyDecisionRecord;
  dependsOn: AnyDecisionRecord[];
  blastRadius: AnyDecisionRecord[];
  danglingReferences: string[];
}

