import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { DocumentService } from '../../../core/services/document.service';
import { AnalysisService } from '../../../core/services/analysis.service';
import type { Workspace } from '../../../core/models/workspace.model';
import type { Document } from '../../../core/models/document.model';
import type { Analysis } from '../../../core/models/analysis.model';

@Component({
  selector: 'app-workspace-detail',
  imports: [RouterLink],
  templateUrl: './workspace-detail.component.html',
})
export class WorkspaceDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private wsService = inject(WorkspaceService);
  private docService = inject(DocumentService);
  private anaService = inject(AnalysisService);

  wsId = '';
  workspace = signal<Workspace | null>(null);
  documents = signal<Document[]>([]);
  analyses = signal<Analysis[]>([]);
  activeTab = signal<'documents' | 'analyses'>('documents');
  uploading = signal(false);
  extractingIds = signal<Set<string>>(new Set());

  ngOnInit() {
    this.wsId = this.route.snapshot.paramMap.get('wsId')!;
    this.load();
  }

  load() {
    this.wsService.get(this.wsId).subscribe(ws => this.workspace.set(ws));
    this.docService.list(this.wsId).subscribe(docs => this.documents.set(docs));
    this.anaService.list(this.wsId).subscribe(anas => this.analyses.set(anas));
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    this.uploading.set(true);
    let done = 0;
    for (const file of files) {
      this.docService.upload(this.wsId, file).subscribe({
        next: doc => {
          this.documents.update(list => [...list, doc]);
          done++;
          if (done === files.length) this.uploading.set(false);
        },
        error: () => { done++; if (done === files.length) this.uploading.set(false); }
      });
    }
    input.value = '';
  }

  extract(doc: Document) {
    this.extractingIds.update(s => new Set([...s, doc.id]));
    this.docService.triggerExtraction(this.wsId, doc.id).subscribe(() => {
      this.pollExtraction(doc.id);
    });
  }

  private pollExtraction(docId: string) {
    const interval = setInterval(() => {
      this.docService.get(this.wsId, docId).subscribe(doc => {
        this.documents.update(list => list.map(d => d.id === docId ? doc : d));
        if (doc.legalExtractionStatus === 'done' || doc.legalExtractionStatus === 'error') {
          clearInterval(interval);
          this.extractingIds.update(s => { const n = new Set(s); n.delete(docId); return n; });
        }
      });
    }, 2000);
  }

  openDoc(doc: Document) {
    this.router.navigate(['/workspaces', this.wsId, 'documents', doc.id]);
  }

  createAnalysis() {
    this.router.navigate(['/workspaces', this.wsId, 'analyses', 'new']);
  }

  openAnalysis(ana: Analysis) {
    this.router.navigate(['/workspaces', this.wsId, 'analyses', ana.id]);
  }

  deleteDoc(doc: Document, event: Event) {
    event.stopPropagation();
    if (!confirm(`Supprimer "${doc.fileName}" ?`)) return;
    this.docService.delete(this.wsId, doc.id).subscribe(() => {
      this.documents.update(list => list.filter(d => d.id !== doc.id));
    });
  }

  statusLabel(status: string) {
    return { none: 'Non extrait', processing: 'En cours...', done: 'Extrait', error: 'Erreur' }[status] ?? status;
  }

  statusColor(status: string) {
    return {
      none: 'bg-gray-100 text-gray-500',
      processing: 'bg-yellow-100 text-yellow-700',
      done: 'bg-green-100 text-green-700',
      error: 'bg-red-100 text-red-700',
    }[status] ?? 'bg-gray-100 text-gray-500';
  }

  formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  }

  formatDate(d: string) {
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  operationLabel(op: string) {
    return { alignment: 'Comparaison', confrontation: 'Audit', aggregation: 'Clausier', dd: 'Due Diligence' }[op] ?? op;
  }
}
