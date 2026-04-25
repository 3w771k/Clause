import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import type { ReferenceAsset } from '../models/reference-asset.model';

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

  getLegalObject(id: string) {
    return this.api.http.get<{
      id: string;
      clauses: Array<{ id: string; type: string; heading: string | null; text: string }>;
    }>(`${this.api.base}/legal-objects/${id}`);
  }
}
