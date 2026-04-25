import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import type { Workspace } from '../models/workspace.model';

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private api = inject(ApiService);

  list() {
    return this.api.http.get<Workspace[]>(`${this.api.base}/workspaces`);
  }

  get(id: string) {
    return this.api.http.get<Workspace>(`${this.api.base}/workspaces/${id}`);
  }

  create(name: string, description?: string) {
    return this.api.http.post<Workspace>(`${this.api.base}/workspaces`, { name, description });
  }

  delete(id: string) {
    return this.api.http.delete(`${this.api.base}/workspaces/${id}`);
  }
}
