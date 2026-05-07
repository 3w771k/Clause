import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import type { ReferenceAsset } from '../models/reference-asset.model';

export interface Amendment {
  id: string;
  assetId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'deferred';
  proposedBy: string;
  proposedAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  sourceAnalysisId: string | null;
  sourceDeliverableId: string | null;
  clauseType: string;
  field: string;
  currentValue: string;
  proposedValue: string;
  rationale: string;
  comment: string | null;
}

@Injectable({ providedIn: 'root' })
export class ReferenceBaseService {
  private api = inject(ApiService);

  list(type?: string) {
    const params = type ? `?type=${type}` : '';
    return this.api.http.get<ReferenceAsset[]>(`${this.api.base}/reference-base${params}`);
  }

  get(id: string) {
    return this.api.http.get<ReferenceAsset>(`${this.api.base}/reference-base/${id}`);
  }

  create(data: Partial<ReferenceAsset>) {
    return this.api.http.post<ReferenceAsset>(`${this.api.base}/reference-base`, data);
  }

  update(id: string, data: Partial<ReferenceAsset>) {
    return this.api.http.put<ReferenceAsset>(`${this.api.base}/reference-base/${id}`, data);
  }

  delete(id: string) {
    return this.api.http.delete(`${this.api.base}/reference-base/${id}`);
  }

  availableDocuments() {
    return this.api.http.get<Array<{
      legalObjectId: string; documentId: string; fileName: string;
      workspaceId: string; uploadedAt: string;
    }>>(`${this.api.base}/reference-base/available-documents`);
  }

  createFromDocument(
    legalObjectId: string,
    name: string,
    description?: string,
    type?: string,
    qualifications?: Record<string, 'ideal' | 'fallback' | 'red_flag' | 'ignore'>,
  ) {
    return this.api.http.post<import('../models/reference-asset.model').ReferenceAsset>(
      `${this.api.base}/reference-base/from-document`,
      { legalObjectId, name, description, type, qualifications }
    );
  }

  getAmendments(assetId: string) {
    return this.api.http.get<Amendment[]>(`${this.api.base}/reference-base/${assetId}/amendments`);
  }

  proposeAmendment(assetId: string, data: {
    clauseType: string; field: string; currentValue?: string;
    proposedValue: string; rationale?: string;
    sourceAnalysisId?: string; sourceDeliverableId?: string;
  }) {
    return this.api.http.post<Amendment>(`${this.api.base}/reference-base/${assetId}/amendments`, data);
  }

  resolveAmendment(assetId: string, amendmentId: string, action: 'accept' | 'reject' | 'defer', comment?: string) {
    return this.api.http.patch<Amendment>(
      `${this.api.base}/reference-base/${assetId}/amendments/${amendmentId}`,
      { action, comment }
    );
  }

  getLegalObject(id: string) {
    return this.api.http.get<{
      id: string;
      clauses: Array<{ id: string; type: string; heading: string | null; text: string }>;
    }>(`${this.api.base}/legal-objects/${id}`);
  }
}
