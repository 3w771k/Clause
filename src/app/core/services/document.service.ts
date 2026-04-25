import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import type { Document, TextPassage } from '../models/document.model';
import type { LegalObject, Clause } from '../models/legal-object.model';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private api = inject(ApiService);

  list(wsId: string) {
    return this.api.http.get<Document[]>(`${this.api.base}/workspaces/${wsId}/documents`);
  }

  get(wsId: string, id: string) {
    return this.api.http.get<Document>(`${this.api.base}/workspaces/${wsId}/documents/${id}`);
  }

  upload(wsId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.api.http.post<Document>(`${this.api.base}/workspaces/${wsId}/documents`, form);
  }

  delete(wsId: string, id: string) {
    return this.api.http.delete(`${this.api.base}/workspaces/${wsId}/documents/${id}`);
  }

  triggerExtraction(wsId: string, id: string) {
    return this.api.http.post<{ message: string; documentId: string }>(
      `${this.api.base}/workspaces/${wsId}/documents/${id}/extract`, {}
    );
  }

  getLegalObject(wsId: string, id: string) {
    return this.api.http.get<LegalObject>(`${this.api.base}/workspaces/${wsId}/documents/${id}/legal-object`);
  }

  getPassages(wsId: string, id: string) {
    return this.api.http.get<TextPassage[]>(`${this.api.base}/workspaces/${wsId}/documents/${id}/passages`);
  }

  fileUrl(wsId: string, id: string): string {
    return `${this.api.base}/workspaces/${wsId}/documents/${id}/file`;
  }

  patchClause(loId: string, clauseId: string, data: { type?: string; heading?: string; text?: string; notes?: string }) {
    return this.api.http.patch<Clause>(`${this.api.base}/legal-objects/${loId}/clauses/${clauseId}`, data);
  }
}
