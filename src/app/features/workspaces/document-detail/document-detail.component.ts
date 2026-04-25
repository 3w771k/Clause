import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DocumentService } from '../../../core/services/document.service';
import { PdfViewerComponent } from './pdf-viewer.component';
import type { Document } from '../../../core/models/document.model';
import type { LegalObject, Clause } from '../../../core/models/legal-object.model';

interface SimilarClause {
  id: string;
  type: string;
  heading: string | null;
  text: string;
  legalObjectId: string;
  documentName: string;
  similarity: number;
}

@Component({
  selector: 'app-document-detail',
  imports: [SlicePipe, FormsModule, PdfViewerComponent],
  templateUrl: './document-detail.component.html',
})
export class DocumentDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private docService = inject(DocumentService);

  wsId = '';
  docId = '';

  document = signal<Document | null>(null);
  legalObject = signal<LegalObject | null>(null);
  loading = signal(true);
  loadingLegal = signal(false);
  extracting = signal(false);

  expandedClause = signal<string | null>(null);
  targetPdfPage = signal<number | null>(null);

  editingClauseId = signal<string | null>(null);
  editingClauseForm = signal<{ type: string; heading: string; text: string; notes: string } | null>(null);
  savingClause = signal(false);

  // ─── Similar clauses (V2 — RAG)
  showSimilarPanel = signal(false);
  similarSourceClauseId = signal<string | null>(null);
  similarClauses = signal<SimilarClause[] | null>(null);
  loadingSimilar = signal(false);

  // ─── Ask clause (V2 — NL)
  askingClauseId = signal<string | null>(null);
  askInput = signal('');
  asking = signal(false);
  askAnswer = signal<string | null>(null);
  readonly askExamples = [
    'Cette clause est-elle standard ?',
    'Quels sont les risques ?',
    'Reformule pour une position plus dure',
  ];

  pdfUrl = computed(() => {
    const doc = this.document();
    if (!doc || !doc.hasFile || doc.mimeType !== 'application/pdf') return null;
    return this.docService.fileUrl(this.wsId, this.docId);
  });
  expandedSection = signal<Record<string, boolean>>({ metadata: true, clauses: true, terms: false, crossReferences: false });
  filterLow = signal(false);
  expandedTerm = signal<string | null>(null);

  lowConfidenceClauses = computed(() =>
    (this.legalObject()?.clauses ?? []).filter(c => c.confidence === 'low')
  );

  visibleClauses = computed(() => {
    const all = this.legalObject()?.clauses ?? [];
    return this.filterLow() ? all.filter(c => c.confidence === 'low') : all;
  });

  ngOnInit() {
    this.wsId = this.route.snapshot.paramMap.get('wsId')!;
    this.docId = this.route.snapshot.paramMap.get('docId')!;
    this.load();
  }

  load() {
    this.loading.set(true);
    this.docService.get(this.wsId, this.docId).subscribe({
      next: doc => {
        this.document.set(doc);
        this.loading.set(false);
        if (doc.legalExtractionStatus === 'done') {
          this.loadLegalObject();
        }
      },
      error: () => this.loading.set(false),
    });
  }

  loadLegalObject() {
    this.loadingLegal.set(true);
    this.docService.getLegalObject(this.wsId, this.docId).subscribe({
      next: lo => {
        this.legalObject.set(lo);
        this.loadingLegal.set(false);
      },
      error: () => this.loadingLegal.set(false),
    });
  }

  extract() {
    this.extracting.set(true);
    this.docService.triggerExtraction(this.wsId, this.docId).subscribe(() => {
      this.pollExtraction();
    });
  }

  private pollExtraction() {
    const interval = setInterval(() => {
      this.docService.get(this.wsId, this.docId).subscribe(doc => {
        this.document.set(doc);
        if (doc.legalExtractionStatus === 'done' || doc.legalExtractionStatus === 'error') {
          clearInterval(interval);
          this.extracting.set(false);
          if (doc.legalExtractionStatus === 'done') {
            this.loadLegalObject();
          }
        }
      });
    }, 2000);
  }

  addToAnalysis() {
    this.router.navigate(['/workspaces', this.wsId, 'analyses', 'new']);
  }

  goBack() {
    this.router.navigate(['/workspaces', this.wsId]);
  }

  toggleClause(clauseId: string) {
    if (this.editingClauseId() === clauseId) return;
    this.expandedClause.update(cur => cur === clauseId ? null : clauseId);
  }

  startEditClause(clause: import('../../../core/models/legal-object.model').Clause) {
    this.editingClauseId.set(clause.id);
    this.editingClauseForm.set({
      type: clause.type,
      heading: clause.heading ?? '',
      text: clause.text,
      notes: clause.notes ?? '',
    });
  }

  cancelEditClause() {
    this.editingClauseId.set(null);
    this.editingClauseForm.set(null);
  }

  saveClauseEdit() {
    const loId = this.legalObject()?.id;
    const clauseId = this.editingClauseId();
    const form = this.editingClauseForm();
    if (!loId || !clauseId || !form) return;

    this.savingClause.set(true);
    this.docService.patchClause(loId, clauseId, {
      type: form.type,
      heading: form.heading || undefined,
      text: form.text,
      notes: form.notes || undefined,
    }).subscribe({
      next: updated => {
        this.legalObject.update(lo => {
          if (!lo) return lo;
          return { ...lo, clauses: lo.clauses.map(c => c.id === clauseId ? updated : c) };
        });
        this.editingClauseId.set(null);
        this.editingClauseForm.set(null);
        this.savingClause.set(false);
      },
      error: () => this.savingClause.set(false),
    });
  }

  updateClauseFormField(field: 'type' | 'heading' | 'text' | 'notes', value: string) {
    this.editingClauseForm.update(f => f ? { ...f, [field]: value } : f);
  }

  toggleSection(key: string) {
    this.expandedSection.update(s => ({ ...s, [key]: !s[key] }));
  }

  toggleTerm(termId: string) {
    this.expandedTerm.update(cur => cur === termId ? null : termId);
  }

  metaParties(): Array<{ name: string; role: string; citation?: { page?: number; extract?: string } }> {
    return (this.legalObject()?.metadata?.['parties'] as any[]) ?? [];
  }

  metaField(key: string): Record<string, unknown> | null {
    const v = this.legalObject()?.metadata?.[key];
    return v ? (v as Record<string, unknown>) : null;
  }

  attributeEntries(attrs: Record<string, unknown>): Array<{ key: string; value: unknown; confidence: string }> {
    return Object.entries(attrs).map(([key, raw]: [string, any]) => ({
      key: key.replace(/_/g, ' '),
      value: raw?.value ?? raw,
      confidence: raw?.confidence ?? 'high',
    }));
  }

  confidenceBadge(c: string): string {
    return { high: 'bg-green-100 text-green-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-red-100 text-red-700' }[c] ?? 'bg-gray-100 text-gray-500';
  }

  confidenceIcon(c: string): boolean { return c === 'low'; }

  navigateToPage(page: number | undefined) {
    if (page) this.targetPdfPage.set(page);
  }

  clauseTypeLabel(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  confidenceColor(confidence: string): string {
    return { high: 'bg-green-100 text-green-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-red-100 text-red-700' }[confidence] ?? 'bg-gray-100 text-gray-500';
  }

  // ─── Similar clauses (V2 — RAG) ─────────────────────────────────────────────

  loadSimilarClauses(clauseId: string) {
    this.showSimilarPanel.set(true);
    this.similarSourceClauseId.set(clauseId);
    this.loadingSimilar.set(true);
    this.similarClauses.set(null);
    this.docService.getSimilarClauses(this.wsId, clauseId).subscribe({
      next: resp => {
        this.similarClauses.set(resp.similar);
        this.loadingSimilar.set(false);
      },
      error: () => {
        this.similarClauses.set([]);
        this.loadingSimilar.set(false);
      },
    });
  }

  closeSimilarPanel() {
    this.showSimilarPanel.set(false);
    this.similarClauses.set(null);
    this.similarSourceClauseId.set(null);
  }

  // ─── Ask clause (V2 — NL) ───────────────────────────────────────────────────

  toggleAskClause(clauseId: string) {
    if (this.askingClauseId() === clauseId) {
      this.askingClauseId.set(null);
      this.askInput.set('');
      this.askAnswer.set(null);
    } else {
      this.askingClauseId.set(clauseId);
      this.askInput.set('');
      this.askAnswer.set(null);
    }
  }

  submitAsk(clauseId: string) {
    const question = this.askInput().trim();
    if (!question) return;
    this.asking.set(true);
    this.askAnswer.set(null);
    this.docService.askClause(clauseId, question).subscribe({
      next: resp => {
        this.askAnswer.set(resp.answer);
        this.asking.set(false);
      },
      error: () => this.asking.set(false),
    });
  }
}
