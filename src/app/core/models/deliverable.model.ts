export type DeliverableType = 'comparative_note' | 'redline' | 'review_note' | 'clausier' | 'dd_synthesis' | 'dd_table' | 'ma_table' | 'deadlines_table' | 'compliance_note' | 'inconsistencies_report';

// ─── Comparative Note ─────────────────────────────────────────────────────────

export type GapLevel = 'none' | 'equivalent' | 'editorial' | 'substantive' | 'unfavorable' | 'missing';

export type SeverityLevel = 'blocking' | 'major' | 'minor' | 'ok';

export interface ClauseComparisonEntry {
  clauseType: string;
  documentA: { text: string | null; citation: unknown } | null;
  documentB: { text: string | null; citation: unknown } | null;
  gap: GapLevel;
  severity?: SeverityLevel;
  recommendation?: string;
  commentary: string;
}

export interface ComparativeNoteContent {
  type: 'comparative_note';
  synthesis: {
    overallGapLevel: 'none' | 'minor' | 'significant' | 'major';
    topGaps: string[];
    negotiationRecommendation: string;
    executiveSummary?: string;
  };
  clauseComparison: ClauseComparisonEntry[];
  onlyInA: string[];
  onlyInB: string[];
  pointByPointRecommendations: string[];
  annexCitations: unknown[];
}

// ─── Redline ──────────────────────────────────────────────────────────────────

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
  comments: unknown[];
}

// ─── Review Note ──────────────────────────────────────────────────────────────

export type ReviewGapLevel = 'none' | 'minor' | 'major' | 'blocking';

export interface ReviewNoteSection {
  clauseType: string;
  clauseLabel: string;
  contractText: string | null;
  playbookRequirement: string | null;
  gapLevel: ReviewGapLevel;
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

// ─── Clausier ─────────────────────────────────────────────────────────────────

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

// ─── Clausier — vue liste plate ───────────────────────────────────────────────

export interface ClausierCustomColumn {
  id: string;
  name: string;
  dataType: 'text' | 'amount' | 'date' | 'boolean' | 'percentage';
  extractionInstruction?: string;
  position: number;
}

export interface ClausierCustomCell {
  value: string | null;
  confidence: number;
  citation?: { fullText: string; articleReference: string; pageNumber: number };
  notFound: boolean;
}

export interface ClausierStructuredField {
  key: string;
  value: string;
}

export interface ClausierFlatRow {
  id: string;
  clauseLabel: string;
  clauseType: string;
  sourceDocumentId: string;
  sourceDocumentName: string;
  clauseText: string;
  isBestVersion: boolean;
  pageNumber?: number;
  structuredFields?: ClausierStructuredField[];
  structuredFieldsStatus?: 'pending' | 'extracting' | 'done' | 'error';
}

export interface ClausierFlatView {
  customColumns: ClausierCustomColumn[];
  rows: ClausierFlatRow[];
  cellsByDoc: Record<string, Record<string, ClausierCustomCell>>;
  selectedStructuredKeys: string[];
}

// ─── DD (Due Diligence) ───────────────────────────────────────────────────────

export type DDRiskLevel = 'ok' | 'low' | 'medium' | 'high' | 'critical';

export interface DDSynthesisSection {
  theme: string;
  riskLevel: DDRiskLevel;
  summary: string;
  recommendation: string;
}

export interface DDSynthesisContent {
  type: 'dd_synthesis';
  title: string;
  executiveSummary: string;
  overallRiskLevel: DDRiskLevel;
  keyFindings: string[];
  documentCount: number;
  sections: DDSynthesisSection[];
}

export interface DDTableRow {
  documentId: string;
  documentName: string;
  clauseType: string;
  clauseLabel: string;
  clauseText: string | null;
  riskLevel: DDRiskLevel;
  finding: string;
  recommendation: string;
}

export interface DDTableContent {
  type: 'dd_table';
  title: string;
  rows: DDTableRow[];
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

// ─── Generic deliverable ──────────────────────────────────────────────────────

export interface Deliverable {
  id: string;
  analysisId: string;
  type: DeliverableType;
  name: string;
  createdAt: string;
  currentVersion: number;
  status: string;
  content: ComparativeNoteContent | RedlineContent | ReviewNoteContent | ClausierContent | DDSynthesisContent | DDTableContent | MaTableContent | DeadlinesTableContent | ComplianceNoteContent | InconsistenciesReportContent | Record<string, unknown>;
  sourceDocumentIds: string[];
  referenceAssetIds: string[];
  sourceOperation: string;
}
