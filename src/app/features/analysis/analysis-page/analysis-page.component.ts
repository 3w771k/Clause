import { Component, inject, signal, OnInit, OnDestroy, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { AnalysisService } from '../../../core/services/analysis.service';
import { DocumentService } from '../../../core/services/document.service';
import { ReferenceBaseService } from '../../../core/services/reference-base.service';
import { AmendmentDialogComponent } from '../../reference-base/amendment-dialog.component';
import { AlignmentViewComponent } from './operations/alignment-view.component';
import { ComparisonViewComponent } from './operations/comparison-view.component';
import { AuditViewComponent } from './operations/audit-view.component';
import { ContractDraftViewComponent } from './operations/contract-draft-view.component';
import { MultiDocRedlineViewComponent } from './operations/multi-doc-redline-view.component';
import { DdViewComponent } from './operations/dd-view.component';
import { TabularViewComponent } from './operations/tabular-view.component';
import { DefaultDeliverableViewComponent } from './operations/default-deliverable-view.component';
import { ChatPanelComponent } from './chat-panel.component';
import { AnalysisModalsComponent } from './analysis-modals.component';
import type { ReferenceAsset } from '../../../core/models/reference-asset.model';
import type { Analysis } from '../../../core/models/analysis.model';
import type { Deliverable } from '../../../core/models/deliverable.model';

const VIEW_TYPE_LABELS: Record<string, string> = {
  tabular: 'Tabular Review',
  audit: 'Audit',
  comparison: 'Comparaison',
  contract_draft: 'Création de contrat',
  multi_doc_redline: 'Redline multi-doc',
};

@Component({
  selector: 'app-analysis-page',
  imports: [FormsModule, AmendmentDialogComponent, ChatPanelComponent, AnalysisModalsComponent,
    AlignmentViewComponent, ComparisonViewComponent, AuditViewComponent,
    ContractDraftViewComponent, MultiDocRedlineViewComponent,
    DdViewComponent, TabularViewComponent, DefaultDeliverableViewComponent],
  templateUrl: './analysis-page.component.html',
})
export class AnalysisPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private anaService = inject(AnalysisService);
  private docService = inject(DocumentService);
  private refService = inject(ReferenceBaseService);

  wsId = '';
  anaId = '';

  analysis = signal<Analysis | null>(null);
  deliverables = signal<Deliverable[]>([]);
  referenceAsset = signal<ReferenceAsset | null>(null);

  showAddDoc = signal(false);
  availableDocs = signal<{ id: string; fileName: string; legalObjectId: string | null; legalExtractionStatus: string }[]>([]);
  showAmendDialog = signal(false);
  showOverflowMenu = signal(false);
  showChat = signal(false);
  showRefine = signal(false); refineInput = signal(''); refining = signal(false); refiningId = signal<string | null>(null);
  showPublish = signal(false); publishingId = signal<string | null>(null);
  publishName = signal(''); publishDescription = signal(''); publishDone = signal(false);

  isGenerating = computed(() => this.analysis()?.status === 'generating');
  operationLabel = computed(() => {
    const a = this.analysis();
    if (!a) return '';
    return VIEW_TYPE_LABELS[a.viewType ?? ''] ?? VIEW_TYPE_LABELS[a.operation ?? ''] ?? '';
  });

  private pollHandle: ReturnType<typeof setTimeout> | null = null;
  private routeSub?: Subscription;

  ngOnInit() {
    this.routeSub = this.route.paramMap.subscribe(params => {
      const wsId = params.get('wsId') ?? '';
      const anaId = params.get('anaId') ?? '';
      if (wsId === this.wsId && anaId === this.anaId) return;
      this.wsId = wsId;
      this.anaId = anaId;
      // Reset state for the new analysis
      this.analysis.set(null);
      this.deliverables.set([]);
      this.referenceAsset.set(null);
      this.showChat.set(false);
      this.showAddDoc.set(false);
      this.showOverflowMenu.set(false);
      if (this.pollHandle) { clearTimeout(this.pollHandle); this.pollHandle = null; }
      this.load();
    });
  }
  ngOnDestroy() {
    if (this.pollHandle) clearTimeout(this.pollHandle);
    this.routeSub?.unsubscribe();
  }

  load() {
    this.anaService.get(this.wsId, this.anaId).subscribe(ana => {
      this.analysis.set(ana);
      if (ana.referenceAssetId) this.refService.get(ana.referenceAssetId).subscribe(a => this.referenceAsset.set(a));
      const ids = (ana.deliverables ?? []).map(d => d.id);
      if (ids.length) this.loadDeliverables(ids);
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
    ids.forEach(id => this.anaService.getDeliverable(id).subscribe(del => {
      this.deliverables.update(list => {
        const exists = list.find(d => d.id === id);
        return exists ? list.map(d => d.id === id ? del : d) : [...list, del];
      });
    }));
  }

  onDeliverableUpdated(id: string) {
    this.anaService.getDeliverable(id).subscribe(del =>
      this.deliverables.update(list => list.map(d => d.id === id ? del : d)));
  }

  loadAvailableDocs() {
    this.docService.list(this.wsId).subscribe(docs => {
      this.availableDocs.set(docs.map(d => ({
        id: d.id, fileName: d.fileName,
        legalObjectId: d.legalObjectId, legalExtractionStatus: d.legalExtractionStatus,
      })));
      this.showAddDoc.set(true);
    });
  }

  addDoc(legalObjectId: string, role: 'target' | 'reference') {
    this.anaService.addDocument(this.wsId, this.anaId, legalObjectId, role).subscribe(() => {
      this.anaService.get(this.wsId, this.anaId).subscribe(a => this.analysis.set(a));
      this.showAddDoc.set(false);
    });
  }

  removeDoc(adId: string) {
    this.anaService.removeDocument(this.wsId, this.anaId, adId).subscribe(() =>
      this.anaService.get(this.wsId, this.anaId).subscribe(a => this.analysis.set(a)));
  }

  openRefine(id: string) {
    this.refiningId.set(id); this.refineInput.set(''); this.showRefine.set(true);
  }
  applyRefine() {
    const id = this.refiningId(); const instr = this.refineInput().trim();
    if (!id || !instr) return;
    this.refining.set(true);
    this.anaService.refineDeliverable(id, instr).subscribe({
      next: () => { this.refining.set(false); this.showRefine.set(false); this.onDeliverableUpdated(id); },
      error: () => this.refining.set(false),
    });
  }

  openPublish(del: Deliverable) {
    this.publishingId.set(del.id); this.publishName.set(del.name);
    this.publishDescription.set(''); this.publishDone.set(false); this.showPublish.set(true);
  }
  submitPublish() {
    const id = this.publishingId(); if (!id) return;
    this.anaService.publishDeliverable(id,
      this.publishName().trim() || undefined,
      this.publishDescription().trim() || undefined,
    ).subscribe(() => { this.publishDone.set(true); this.onDeliverableUpdated(id); });
  }
}
