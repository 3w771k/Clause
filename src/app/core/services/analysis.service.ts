import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import type { Analysis, AnalysisDocument } from '../models/analysis.model';
import type { Deliverable } from '../models/deliverable.model';

@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private api = inject(ApiService);

  // Listing/création scopés workspace : restent sous /api/workspaces/:wsId/analyses
  list(wsId: string) {
    return this.api.http.get<Analysis[]>(`${this.api.base}/workspaces/${wsId}/analyses`);
  }

  create(wsId: string, name: string, operation?: string, referenceAssetId?: string) {
    return this.api.http.post<Analysis>(`${this.api.base}/workspaces/${wsId}/analyses`, {
      name, operation, referenceAssetId,
    });
  }

  // Per-analysis : sous /api/analyses/:anaId (wsId arg gardé pour rétrocompat appels existants)
  get(_wsId: string, anaId: string) {
    return this.api.http.get<Analysis>(`${this.api.base}/analyses/${anaId}`);
  }

  startGeneration(_wsId: string, anaId: string) {
    return this.api.http.post<{ status: string }>(
      `${this.api.base}/analyses/${anaId}/start-generation`, {}
    );
  }

  delete(_wsId: string, anaId: string) {
    return this.api.http.delete(`${this.api.base}/analyses/${anaId}`);
  }

  addDocument(_wsId: string, anaId: string, legalObjectId: string, role: 'target' | 'reference' = 'target') {
    return this.api.http.post<AnalysisDocument>(
      `${this.api.base}/analyses/${anaId}/documents`,
      { legalObjectId, role }
    );
  }

  removeDocument(_wsId: string, anaId: string, adId: string) {
    return this.api.http.delete(`${this.api.base}/analyses/${anaId}/documents/${adId}`);
  }

  getDeliverable(id: string) {
    return this.api.http.get<Deliverable>(`${this.api.base}/deliverables/${id}`);
  }

  acceptRedlineChange(id: string, changeId: string) {
    return this.api.http.post(`${this.api.base}/deliverables/${id}/redline/accept`, { changeId });
  }

  rejectRedlineChange(id: string, changeId: string) {
    return this.api.http.post(`${this.api.base}/deliverables/${id}/redline/reject`, { changeId });
  }

  acceptAllRedlineChanges(id: string) {
    return this.api.http.post(`${this.api.base}/deliverables/${id}/redline/accept-all`, {});
  }

  rejectAllRedlineChanges(id: string) {
    return this.api.http.post(`${this.api.base}/deliverables/${id}/redline/reject-all`, {});
  }

  publishDeliverable(id: string, name?: string, description?: string) {
    return this.api.http.post<{ assetId: string }>(
      `${this.api.base}/deliverables/${id}/publish`,
      { name, description }
    );
  }

  refineDeliverable(id: string, instruction: string) {
    return this.api.http.post<{ id: string; currentVersion: number; content: unknown }>(
      `${this.api.base}/deliverables/${id}/refine`,
      { instruction }
    );
  }

  parseIntent(workspaceId: string, message: string) {
    return this.api.http.post<{
      operation: 'confrontation' | 'alignment' | 'aggregation' | 'dd' | 'ma_mapping' | 'deadlines' | 'compliance' | 'inconsistencies' | 'unclear';
      targetDocumentIds: string[];
      referenceDocumentId: string | null;
      referenceAssetId: string | null;
      suggestedName: string;
      reasoning: string;
      confidence: 'high' | 'medium' | 'low';
      clarificationNeeded: string | null;
    }>(`${this.api.base}/intent/parse`, { workspaceId, message });
  }

  getMessages(wsId: string, anaId: string) {
    return this.api.http.get<Array<{
      id: string; analysisId: string; timestamp: string; role: string;
      content: string; deliverableReferences: string[]; citations: unknown[];
    }>>(`${this.api.base}/workspaces/${wsId}/analyses/${anaId}/messages`);
  }

  sendMessage(wsId: string, anaId: string, content: string) {
    return this.api.http.post<{
      userMessageId: string;
      assistantMessage: { id: string; role: string; content: string; timestamp: string; deliverableReferences: string[] };
      deliverableIds: string[];
    }>(`${this.api.base}/workspaces/${wsId}/analyses/${anaId}/messages`, { content });
  }

  listAllDeliverables() {
    return this.api.http.get<Array<{
      id: string; analysisId: string; type: string; name: string;
      createdAt: string; status: string; currentVersion: number; sourceOperation: string;
    }>>(`${this.api.base}/deliverables`);
  }

  // ─── Tabular Reviews ────────────────────────────────────────────────────────

  listTabularReviews(anaId: string) {
    return this.api.http.get<TabularReview[]>(`${this.api.base}/analyses/${anaId}/tabular-reviews`);
  }

  getTabularReview(anaId: string, trId: string) {
    return this.api.http.get<TabularReview>(`${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}`);
  }

  createTabularReview(anaId: string, payload: { name: string; workflowId?: string; columns?: TabularColumn[] }) {
    return this.api.http.post<TabularReview>(`${this.api.base}/analyses/${anaId}/tabular-reviews`, payload);
  }

  runTabularReview(anaId: string, trId: string) {
    return this.api.http.post<{ trId: string; runAt: string; rowsProcessed: number }>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/run`, {}
    );
  }

  rerunTabularCell(anaId: string, trId: string, rowId: string, colId: string) {
    return this.api.http.post<TabularCell>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/rows/${rowId}/cells/${colId}/rerun`, {}
    );
  }

  updateTabularCell(anaId: string, trId: string, rowId: string, colId: string, value: string) {
    return this.api.http.patch<TabularCell>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/rows/${rowId}/cells/${colId}`,
      { value }
    );
  }

  // Brief G — auto-build : crée une review depuis les clauses extraites
  autoBuildTabularReview(anaId: string, payload: { name?: string; includedTypes?: string[] }) {
    return this.api.http.post<TabularReview & { detectedTypes: Array<{ type: string; count: number; sample: string }> }>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/auto-build`, payload,
    );
  }

  // Brief G — preview clause types disponibles avant création (no review id requis)
  previewAnalysisClauseTypes(anaId: string) {
    return this.api.http.get<{ types: Array<{ type: string; count: number; sample: string }> }>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/clause-types-preview`,
    );
  }

  // Brief E — preview des types de clauses présents dans les docs de l'analyse
  listClauseTypes(anaId: string, trId: string) {
    return this.api.http.get<{ types: Array<{ type: string; occurrences: number; attributeKeys: string[]; sampleText: string }> }>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/clause-types`,
    );
  }

  updateTabularColumn(
    anaId: string, trId: string, colId: string,
    payload: { label?: string; question?: string; expectedType?: string;
      extractionStrategy?: string; clauseTypeOntologyId?: string | null; attributePath?: string | null; },
    rerun = false,
  ) {
    const url = `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/columns/${colId}${rerun ? '?rerun=true' : ''}`;
    return this.api.http.patch<TabularReview>(url, payload);
  }

  addTabularColumn(
    anaId: string, trId: string,
    payload: { label: string; question: string; expectedType?: string; afterColumnId?: string },
  ) {
    return this.api.http.post<TabularReview>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/columns`, payload,
    );
  }

  deleteTabularColumn(anaId: string, trId: string, colId: string) {
    return this.api.http.delete<void>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/columns/${colId}`,
    );
  }

  rerunTabularColumn(anaId: string, trId: string, colId: string) {
    return this.api.http.post<TabularReview>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/columns/${colId}/rerun`, {},
    );
  }

  // Tabular Analysis (Brief A) — cross-row consistency + verdict + synthesis
  analyzeTabularReview(anaId: string, trId: string) {
    return this.api.http.post<TabularAnalysis>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/analyze`, {},
    );
  }

  getTabularAnalysis(anaId: string, trId: string) {
    return this.api.http.get<TabularAnalysis | null>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/analysis`,
    );
  }

  // Brief B1 — règles custom de cohérence
  listCustomChecks(anaId: string, trId: string) {
    return this.api.http.get<CustomCheck[]>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/custom-checks`,
    );
  }

  addCustomCheck(anaId: string, trId: string, prompt: string) {
    return this.api.http.post<CustomCheck>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/custom-checks`,
      { prompt },
    );
  }

  deleteCustomCheck(anaId: string, trId: string, checkId: string) {
    return this.api.http.delete<void>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/custom-checks/${checkId}`,
    );
  }

  // Brief B2 — ajouter un doc/row à une review
  addTabularRow(anaId: string, trId: string, legalObjectId: string) {
    return this.api.http.post<{ row: TabularRow }>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/rows`,
      { legalObjectId },
    );
  }

  // Brief C1 — supprimer une ligne
  deleteTabularRow(anaId: string, trId: string, rowId: string) {
    return this.api.http.delete<void>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/rows/${rowId}`,
    );
  }

  setTabularReviewPlaybook(anaId: string, trId: string, playbookAssetId: string | null) {
    return this.api.http.patch<{ playbookAssetId: string | null }>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/playbook`,
      { playbookAssetId },
    );
  }

  queryTabularReview(anaId: string, trId: string, question: string) {
    return this.api.http.post<{ question: string; generatedSql: string; result: Record<string, unknown>[]; error: string | null }>(
      `${this.api.base}/analyses/${anaId}/tabular-reviews/${trId}/query`, { question }
    );
  }

  listWorkflows() {
    return this.api.http.get<Workflow[]>(`${this.api.base}/workflows`);
  }
}

// ─── Models ──────────────────────────────────────────────────────────────────

export interface TabularColumn {
  id: string;
  label: string;
  question: string;
  expectedType: string;
  // Brief E — extraction hybride
  extractionStrategy?: 'llm_only' | 'attribute_first' | 'clause_filtered_llm';
  clauseTypeOntologyId?: string;
  attributePath?: string;
}

export interface TabularCell {
  id: string;
  tabularReviewId: string;
  rowId: string;
  columnId: string;
  columnLabel: string;
  value: string | null;
  rawValue: string | null;
  confidence: string;
  status?: 'fresh' | 'pending' | 'stale';
  citationJson: string | null;
  isUserEdited: boolean;
  lastRunAt: string | null;
  // Brief E — comment cette cellule a été produite
  extractionMode?: 'attribute' | 'clause_llm' | 'doc_llm' | 'absent';
}

export interface TabularRow {
  id: string;
  tabularReviewId: string;
  documentId: string;
  fileName?: string;
  legalObjectId: string | null;
  orderInReview: number;
  cells: TabularCell[];
}

export interface TabularReview {
  id: string;
  analysisId: string;
  name: string;
  workflowId: string | null;
  isCustom: boolean;
  columns: TabularColumn[];
  rows?: TabularRow[];
  lastRunAt: string | null;
  createdAt: string;
  // Brief A — analyse cohérence
  analysis?: TabularAnalysis | null;
  lastAnalysisAt?: string | null;
  playbookAssetId?: string | null;
}

export interface ColumnOutlier {
  rowId: string;
  documentName: string;
  value: string | null;
  reason: string;
}
export interface ColumnAnalysis {
  columnId: string;
  columnLabel: string;
  outliers: ColumnOutlier[];
  synthesis: string;
}
export type RowVerdictLevel = 'compliant' | 'attention' | 'risk';
export interface RowVerdict {
  rowId: string;
  documentName: string;
  verdict: RowVerdictLevel;
  rationale: string;
  brokenRules: string[];
}
export interface ConsistencyRuleResult {
  ruleId: string;
  ruleLabel: string;
  scope: 'cross_row' | 'cross_column';
  findings: string[];
}

export interface CustomCheck {
  id: string;
  prompt: string;
  createdAt: string;
}

export interface CustomCheckResult {
  checkId: string;
  prompt: string;
  findings: Array<{ rowId?: string; documentName?: string; finding: string }>;
  summary: string;
}
export interface TabularAnalysis {
  schemaVersion: 1;
  generatedAt: string;
  reviewId: string;
  columnAnalyses: ColumnAnalysis[];
  rowVerdicts?: RowVerdict[];
  globalSynthesis: string;
  playbookAssetId?: string | null;
  declaredRulesResults?: ConsistencyRuleResult[];
  customCheckResults?: CustomCheckResult[];
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  kind: string;
  language: string;
  applicableDocumentTypes: string[];
  definition: {
    columns: Array<{
      label: string; question: string; expectedType: string;
      extractionStrategy?: string; clauseTypeOntologyId?: string; attributePath?: string;
    }>;
  };
}
