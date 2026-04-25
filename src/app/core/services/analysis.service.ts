import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import type { Analysis, AnalysisDocument, ConversationMessage } from '../models/analysis.model';
import type { Deliverable } from '../models/deliverable.model';

@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private api = inject(ApiService);

  list(wsId: string) {
    return this.api.http.get<Analysis[]>(`${this.api.base}/workspaces/${wsId}/analyses`);
  }

  get(wsId: string, anaId: string) {
    return this.api.http.get<Analysis>(`${this.api.base}/workspaces/${wsId}/analyses/${anaId}`);
  }

  create(wsId: string, name: string, operation?: string, referenceAssetId?: string) {
    return this.api.http.post<Analysis>(`${this.api.base}/workspaces/${wsId}/analyses`, {
      name, operation, referenceAssetId,
    });
  }

  startGeneration(wsId: string, anaId: string) {
    return this.api.http.post<{ assistantMessageId: string }>(
      `${this.api.base}/workspaces/${wsId}/analyses/${anaId}/start-generation`, {}
    );
  }

  delete(wsId: string, anaId: string) {
    return this.api.http.delete(`${this.api.base}/workspaces/${wsId}/analyses/${anaId}`);
  }

  addDocument(wsId: string, anaId: string, legalObjectId: string, role: 'target' | 'reference' = 'target') {
    return this.api.http.post<AnalysisDocument>(
      `${this.api.base}/workspaces/${wsId}/analyses/${anaId}/documents`,
      { legalObjectId, role }
    );
  }

  removeDocument(wsId: string, anaId: string, adId: string) {
    return this.api.http.delete(`${this.api.base}/workspaces/${wsId}/analyses/${anaId}/documents/${adId}`);
  }

  getMessages(wsId: string, anaId: string) {
    return this.api.http.get<ConversationMessage[]>(
      `${this.api.base}/workspaces/${wsId}/analyses/${anaId}/messages`
    );
  }

  sendMessage(wsId: string, anaId: string, content: string) {
    return this.api.http.post<{
      userMessageId: string;
      assistantMessage: ConversationMessage;
      deliverableIds: string[];
    }>(`${this.api.base}/workspaces/${wsId}/analyses/${anaId}/messages`, { content });
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

  listAllDeliverables() {
    return this.api.http.get<Array<{
      id: string; analysisId: string; type: string; name: string;
      createdAt: string; status: string; currentVersion: number; sourceOperation: string;
    }>>(`${this.api.base}/deliverables`);
  }
}
