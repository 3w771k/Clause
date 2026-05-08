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

  updateTabularColumn(
    anaId: string, trId: string, colId: string,
    payload: { label?: string; question?: string; expectedType?: string },
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
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  kind: string;
  language: string;
  applicableDocumentTypes: string[];
  definition: { columns: Array<{ label: string; question: string; expectedType: string }> };
}
