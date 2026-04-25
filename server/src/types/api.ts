import { z } from 'zod';

// ─── LLM structured output schemas ────────────────────────────────────────────

export const DocumentClassificationSchema = z.object({
  type: z.string(),
  subtype: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type DocumentClassification = z.infer<typeof DocumentClassificationSchema>;

export const NluIntentSchema = z.object({
  operation: z.enum(['alignment', 'confrontation', 'aggregation', 'unclear', 'ma_mapping', 'deadlines', 'compliance', 'inconsistencies']),
  targetDocuments: z.array(z.string()).optional().default([]),
  referenceAssets: z.array(z.string()).optional().default([]),
  deliverableTypes: z.array(z.string()).optional().default([]),
  clarificationNeeded: z.string().nullable().optional().default(null),
  confidence: z.union([
    z.enum(['high', 'medium', 'low']),
    z.number().transform(v => v > 0.7 ? 'high' : v > 0.4 ? 'medium' : 'low' as const),
  ]).optional().default('medium'),
});
export type NluIntent = z.infer<typeof NluIntentSchema>;

export const ExtractedClauseSchema = z.object({
  id: z.string(),
  type: z.string(),
  heading: z.string().nullable(),
  sequenceNumber: z.string().nullable(),
  text: z.string(),
  attributes: z.record(z.unknown()).default({}),
  confidence: z.enum(['high', 'medium', 'low']).default('high'),
  linkedDefinedTerms: z.array(z.string()).default([]),
});

export const ExtractedDefinedTermSchema = z.object({
  id: z.string(),
  term: z.string(),
  definition: z.string(),
  confidence: z.enum(['high', 'medium', 'low']).default('high'),
});

export const LegalExtractionResultSchema = z.object({
  documentType: z.string(),
  documentSubtype: z.string().nullable(),
  language: z.string().default('fr'),
  overallConfidence: z.enum(['high', 'medium', 'low']).default('high'),
  metadata: z.record(z.unknown()).default({}),
  clauses: z.array(ExtractedClauseSchema),
  definedTerms: z.array(ExtractedDefinedTermSchema),
});
export type LegalExtractionResult = z.infer<typeof LegalExtractionResultSchema>;

// ─── Deliverable content — Comparative Note ───────────────────────────────────

export interface ClauseComparisonEntry {
  clauseType: string;
  documentA: {
    text: string | null;
    citation: { documentId: string; passageIds: string[]; page: number; extract: string } | null;
  };
  documentB: {
    text: string | null;
    citation: { documentId: string; passageIds: string[]; page: number; extract: string } | null;
  };
  gap: 'none' | 'equivalent' | 'editorial' | 'substantive' | 'unfavorable' | 'missing';
  commentary: string;
}

export interface ComparativeNoteContent {
  type: 'comparative_note';
  synthesis: {
    overallGapLevel: 'none' | 'minor' | 'significant' | 'major';
    topGaps: string[];
    negotiationRecommendation: string;
  };
  clauseComparison: ClauseComparisonEntry[];
  onlyInA: string[];
  onlyInB: string[];
  pointByPointRecommendations: string[];
  annexCitations: unknown[];
}

// ─── Deliverable content — Redline ────────────────────────────────────────────

export interface RedlineChange {
  id: string;
  type: 'replacement' | 'insertion' | 'deletion';
  originalText: string;
  newText: string;
  location: { startOffset: number; endOffset: number };
  clauseContext: string;
  rationale: string;
  referenceSource: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface RedlineContent {
  type: 'redline';
  targetDocumentId: string;
  baseHtml: string;
  changes: RedlineChange[];
  comments: Array<{
    id: string;
    anchor: { startOffset: number; endOffset: number };
    author: string;
    authorName: string;
    text: string;
    createdAt: string;
    thread: unknown[];
  }>;
}

// ─── Deliverable content — Review Note ───────────────────────────────────────

export interface ReviewNoteSection {
  clauseType: string;
  clauseLabel: string;
  contractText: string | null;
  playbookRequirement: string | null;
  gapLevel: 'none' | 'minor' | 'major' | 'blocking';
  comment: string;
  suggestedLanguage: string | null;
}

export interface ReviewNoteContent {
  type: 'review_note';
  summary: string;
  contractDocumentId: string;
  referenceAssetId: string;
  globalVerdict: 'conforme' | 'a_negocier' | 'non_conforme';
  sections: ReviewNoteSection[];
  priorityPoints: string[];
}

// ─── M&A Mapping ─────────────────────────────────────────────────────────────

export interface MaEngagementRow {
  documentName: string;
  documentId: string;
  clauseType: string;
  summary: string;
  riskLevel: 'high' | 'medium' | 'low';
  citation: { page?: number; extract?: string } | null;
}

export interface MaTableContent {
  type: 'ma_table';
  title: string;
  documentCount: number;
  rows: MaEngagementRow[];
}

// ─── Deadlines ────────────────────────────────────────────────────────────────

export interface DeadlineRow {
  documentName: string;
  documentId: string;
  deadlineType: string;
  dateOrFormula: string;
  trigger: string;
  consequence: string;
  isNearTerm: boolean;
  citation: { page?: number; extract?: string } | null;
}

export interface DeadlinesTableContent {
  type: 'deadlines_table';
  title: string;
  rows: DeadlineRow[];
}

// ─── Compliance ───────────────────────────────────────────────────────────────

export type ComplianceStatus = 'conforme' | 'attention' | 'non_conforme';

export interface ComplianceRow {
  documentName: string;
  clauseType: string;
  clauseLabel: string;
  requirement: string;
  status: ComplianceStatus;
  recommendedAction: string;
}

export interface ComplianceNoteContent {
  type: 'compliance_note';
  title: string;
  framework: string;
  synthesis: string;
  rows: ComplianceRow[];
}

// ─── Inconsistencies ─────────────────────────────────────────────────────────

export type InconsistencyLevel = 'aligned' | 'variant' | 'divergent';

export interface InconsistencyGroupRow {
  documentName: string;
  documentId: string;
  clauseText: string | null;
  level: InconsistencyLevel;
}

export interface InconsistencyGroup {
  clauseType: string;
  clauseLabel: string;
  rows: InconsistencyGroupRow[];
}

export interface InconsistenciesReportContent {
  type: 'inconsistencies_report';
  title: string;
  documentCount: number;
  groups: InconsistencyGroup[];
}

// ─── Clausier TCD ────────────────────────────────────────────────────────────

export interface ClausierTableColumn {
  id: string;
  name: string;
  dataType: 'text' | 'amount' | 'date' | 'boolean' | 'percentage';
  extractionInstruction?: string;
  position: number;
  isLocked: boolean;
}

export interface ClausierTableCell {
  value: string | null;
  confidence: number;
  citation?: { fullText: string; articleReference: string; pageNumber: number };
  isManuallyEdited: boolean;
  notFound?: boolean;
}

export interface ClausierTableRow {
  sourceDocumentId: string;
  sourceDocumentName: string;
  cells: Record<string, ClausierTableCell>;
}

export interface ClausierTableView {
  columns: ClausierTableColumn[];
  rows: ClausierTableRow[];
}

// ─── Deliverable content — Clausier ──────────────────────────────────────────

export interface ClausierEntry {
  clauseType: string;
  clauseLabel: string;
  bestVersion: string;
  sourceDocumentId: string;
  sourceDocumentName: string;
  alternativeVersions: Array<{ text: string; sourceDocumentId: string }>;
  notes: string;
}

export interface ClausierContent {
  type: 'clausier';
  title: string;
  scope: string;
  entries: ClausierEntry[];
  createdFromDocumentIds: string[];
}
