import { Component, inject, signal, OnInit, OnDestroy, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import { AnalysisService } from '../../../core/services/analysis.service';
import { DocumentService } from '../../../core/services/document.service';
import { ComparativeNoteComponent } from '../deliverables/comparative-note/comparative-note.component';
import { RedlineComponent } from '../deliverables/redline/redline.component';
import { ReviewNoteComponent } from '../deliverables/review-note/review-note.component';
import { ClausierComponent } from '../deliverables/clausier/clausier.component';
import { DDSynthesisComponent } from '../deliverables/dd-synthesis/dd-synthesis.component';
import { DDTableComponent } from '../deliverables/dd-table/dd-table.component';
import { MaTableComponent } from '../deliverables/ma-table/ma-table.component';
import { DeadlinesTableComponent } from '../deliverables/deadlines-table/deadlines-table.component';
import { ComplianceNoteComponent } from '../deliverables/compliance-note/compliance-note.component';
import { InconsistenciesReportComponent } from '../deliverables/inconsistencies-report/inconsistencies-report.component';
import type { Analysis } from '../../../core/models/analysis.model';
import type { Deliverable } from '../../../core/models/deliverable.model';
import type { ComparativeNoteContent, RedlineContent, ReviewNoteContent, ClausierContent, DDSynthesisContent, DDTableContent, MaTableContent, DeadlinesTableContent, ComplianceNoteContent, InconsistenciesReportContent } from '../../../core/models/deliverable.model';

@Component({
  selector: 'app-analysis-page',
  imports: [RouterLink, FormsModule, JsonPipe, ComparativeNoteComponent, RedlineComponent, ReviewNoteComponent, ClausierComponent, DDSynthesisComponent, DDTableComponent, MaTableComponent, DeadlinesTableComponent, ComplianceNoteComponent, InconsistenciesReportComponent],
  templateUrl: './analysis-page.component.html',
})
export class AnalysisPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private anaService = inject(AnalysisService);
  private docService = inject(DocumentService);

  wsId = '';
  anaId = '';

  analysis = signal<Analysis | null>(null);
  deliverables = signal<Deliverable[]>([]);
  activeDeliverable = signal<Deliverable | null>(null);

  // Onglets pour les analyses alignment
  alignmentTab = signal<'note' | 'redline' | 'document'>('note');

  // Onglets pour les analyses DD
  ddTab = signal<'synthesis' | 'table'>('synthesis');

  // Add-document panel
  showAddDoc = signal(false);
  availableDocs = signal<{ id: string; fileName: string; legalObjectId: string | null; legalExtractionStatus: string }[]>([]);

  // Publish modal
  showPublish = signal(false);
  publishingId = signal<string | null>(null);
  publishName = signal('');
  publishDescription = signal('');
  publishDone = signal(false);

  // Refine deliverable
  showRefine = signal(false);
  refineInput = signal('');
  refining = signal(false);
  readonly refineExamples = [
    'Renforce le verdict sur la confidentialité',
    'Ajoute une recommandation sur la juridiction',
    'Reformule la synthèse en plus court',
    'Ajoute un point sur la durée du contrat',
  ];

  // Polling state
  private pollHandle: ReturnType<typeof setTimeout> | null = null;

  // Computed helpers pour alignment
  comparativeNoteDeliverable = computed(() =>
    this.deliverables().find(d => d.type === 'comparative_note') ?? null
  );

  redlineDeliverable = computed(() =>
    this.deliverables().find(d => d.type === 'redline') ?? null
  );

  // Computed helpers pour DD
  ddSynthesisDeliverable = computed(() =>
    this.deliverables().find(d => d.type === 'dd_synthesis') ?? null
  );

  ddTableDeliverable = computed(() =>
    this.deliverables().find(d => d.type === 'dd_table') ?? null
  );

  isGenerating = computed(() => this.analysis()?.status === 'generating');

  ngOnInit() {
    this.wsId = this.route.snapshot.paramMap.get('wsId')!;
    this.anaId = this.route.snapshot.paramMap.get('anaId')!;
    this.load();
  }

  ngOnDestroy() {
    if (this.pollHandle) clearTimeout(this.pollHandle);
  }

  load() {
    this.anaService.get(this.wsId, this.anaId).subscribe(ana => {
      this.analysis.set(ana);
      const delIds = (ana.deliverables ?? []).map(d => d.id);
      if (delIds.length) this.loadDeliverables(delIds);
      if (ana.status === 'generating') this.scheduleRefresh();
    });
  }

  private scheduleRefresh() {
    if (this.pollHandle) clearTimeout(this.pollHandle);
    this.pollHandle = setTimeout(() => {
      this.anaService.get(this.wsId, this.anaId).subscribe(ana => {
        this.analysis.set(ana);
        const known = new Set(this.deliverables().map(d => d.id));
        const newIds = (ana.deliverables ?? []).map(d => d.id).filter(id => !known.has(id));
        if (newIds.length) this.loadDeliverables(newIds);
        if (ana.status === 'generating') this.scheduleRefresh();
      });
    }, 2000);
  }

  loadDeliverables(ids: string[]) {
    ids.forEach(id => {
      this.anaService.getDeliverable(id).subscribe(del => {
        this.deliverables.update(list => {
          const exists = list.find(d => d.id === id);
          return exists ? list.map(d => d.id === id ? del : d) : [...list, del];
        });
        if (!this.activeDeliverable()) this.activeDeliverable.set(del);
      });
    });
  }

  openDeliverable(del: Deliverable) {
    this.activeDeliverable.set(del);
  }

  loadAndOpen(id: string) {
    this.anaService.getDeliverable(id).subscribe(del => {
      this.deliverables.update(list => {
        const exists = list.find(d => d.id === id);
        return exists ? list.map(d => d.id === id ? del : d) : [...list, del];
      });
      this.activeDeliverable.set(del);
    });
  }

  onDeliverableUpdated(deliverableId: string) {
    this.anaService.getDeliverable(deliverableId).subscribe(del => {
      this.deliverables.update(list =>
        list.map(d => d.id === deliverableId ? del : d)
      );
      if (this.activeDeliverable()?.id === deliverableId) this.activeDeliverable.set(del);
    });
  }

  asComparativeNote(d: Deliverable) { return d.content as ComparativeNoteContent; }
  asRedline(d: Deliverable) { return d.content as RedlineContent; }
  asReviewNote(d: Deliverable) { return d.content as ReviewNoteContent; }
  asClausier(d: Deliverable) { return d.content as ClausierContent; }
  asDDSynthesis(d: Deliverable) { return d.content as DDSynthesisContent; }
  asDDTable(d: Deliverable) { return d.content as DDTableContent; }
  asMaTable(d: Deliverable) { return d.content as MaTableContent; }
  asDeadlinesTable(d: Deliverable) { return d.content as DeadlinesTableContent; }
  asComplianceNote(d: Deliverable) { return d.content as ComplianceNoteContent; }
  asInconsistenciesReport(d: Deliverable) { return d.content as InconsistenciesReportContent; }

  deliverableIcon(type: string) {
    return {
      comparative_note: '📋',
      redline: '📝',
      review_note: '🔍',
      clausier: '📚',
      dd_synthesis: '🔎',
      dd_table: '📊',
      ma_table: '🏦',
      deadlines_table: '📅',
      compliance_note: '✅',
      inconsistencies_report: '🔀',
    }[type] ?? '📄';
  }

  deliverableTypeLabel(type: string) {
    return {
      comparative_note: 'Note comparative',
      redline: 'Redline',
      review_note: 'Note de revue',
      clausier: 'Clausier',
      dd_synthesis: 'Synthèse DD',
      dd_table: 'Tableau DD',
      ma_table: 'Cartographie M&A',
      deadlines_table: 'Échéances',
      compliance_note: 'Audit conformité',
      inconsistencies_report: 'Incohérences',
    }[type] ?? type;
  }

  loadAvailableDocs() {
    this.docService.list(this.wsId).subscribe(docs => {
      this.availableDocs.set(docs.map(d => ({
        id: d.id,
        fileName: d.fileName,
        legalObjectId: d.legalObjectId,
        legalExtractionStatus: d.legalExtractionStatus,
      })));
      this.showAddDoc.set(true);
    });
  }

  addDoc(legalObjectId: string, role: 'target' | 'reference') {
    this.anaService.addDocument(this.wsId, this.anaId, legalObjectId, role).subscribe(() => {
      this.anaService.get(this.wsId, this.anaId).subscribe(ana => this.analysis.set(ana));
      this.showAddDoc.set(false);
    });
  }

  removeDoc(adId: string) {
    this.anaService.removeDocument(this.wsId, this.anaId, adId).subscribe(() => {
      this.anaService.get(this.wsId, this.anaId).subscribe(ana => this.analysis.set(ana));
    });
  }

  openPublish(del: Deliverable) {
    this.publishingId.set(del.id);
    this.publishName.set(del.name);
    this.publishDescription.set('');
    this.publishDone.set(false);
    this.showPublish.set(true);
  }

  submitPublish() {
    const id = this.publishingId();
    if (!id) return;
    this.anaService.publishDeliverable(id, this.publishName().trim() || undefined, this.publishDescription().trim() || undefined)
      .subscribe({
        next: () => {
          this.publishDone.set(true);
          this.anaService.getDeliverable(id).subscribe(del => {
            this.deliverables.update(list => list.map(d => d.id === id ? del : d));
          });
        },
      });
  }

  isPublishableType(type: string) {
    return ['review_note', 'clausier', 'dd_synthesis', 'comparative_note'].includes(type);
  }

  roleLabel(role: string) {
    return { target: 'Cible', reference: 'Référence' }[role] ?? role;
  }

  roleColor(role: string) {
    return { target: 'bg-blue-100 text-blue-700', reference: 'bg-purple-100 text-purple-700' }[role] ?? 'bg-gray-100 text-gray-600';
  }

  // ─── Refine deliverable (V2 — NL) ────────────────────────────────────────────

  openRefine() {
    this.refineInput.set('');
    this.showRefine.set(true);
  }

  closeRefine() {
    this.showRefine.set(false);
    this.refineInput.set('');
  }

  applyRefine() {
    const instruction = this.refineInput().trim();
    const deliverable = this.activeDeliverable();
    if (!instruction || !deliverable) return;
    this.refining.set(true);
    this.anaService.refineDeliverable(deliverable.id, instruction).subscribe({
      next: () => {
        this.refining.set(false);
        this.closeRefine();
        this.onDeliverableUpdated(deliverable.id);
      },
      error: () => this.refining.set(false),
    });
  }
}
