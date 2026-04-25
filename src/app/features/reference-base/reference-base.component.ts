import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReferenceBaseService } from '../../core/services/reference-base.service';
import { AnalysisService } from '../../core/services/analysis.service';
import type { ReferenceAsset } from '../../core/models/reference-asset.model';

interface DeliverableSummary {
  id: string; analysisId: string; type: string; name: string;
  createdAt: string; status: string; currentVersion: number; sourceOperation: string;
}

interface EditableSection {
  clauseType: string;
  stakes: string;
  positions: {
    ideal?: { description: string };
    fallback?: { description: string };
    redFlag?: { description: string };
  };
  sourceClauseIds: string[];
}

@Component({
  selector: 'app-reference-base',
  imports: [FormsModule],
  templateUrl: './reference-base.component.html',
})
export class ReferenceBaseComponent implements OnInit {
  private refService = inject(ReferenceBaseService);
  private anaService = inject(AnalysisService);

  assets = signal<ReferenceAsset[]>([]);
  selected = signal<ReferenceAsset | null>(null);
  filterType = signal('');

  // Create modal
  showCreate = signal(false);
  createTab = signal<'document' | 'livrable'>('document');
  creating = signal(false);
  publishName = signal('');
  publishDescription = signal('');

  // From deliverable
  selectedDeliverable = signal<DeliverableSummary | null>(null);
  availableDeliverables = signal<DeliverableSummary[]>([]);
  loadingDeliverables = signal(false);
  publishableTypes = ['review_note', 'clausier', 'dd_synthesis', 'comparative_note'];
  filteredDeliverables = computed(() =>
    this.availableDeliverables().filter(d => this.publishableTypes.includes(d.type))
  );

  // From document
  documentStep = signal<'pick' | 'qualify' | 'confirm'>('pick');
  selectedDocument = signal<{ legalObjectId: string; fileName: string } | null>(null);
  availableDocuments = signal<Array<{ legalObjectId: string; documentId: string; fileName: string; workspaceId: string; uploadedAt: string }>>([]);
  loadingDocuments = signal(false);
  documentRefType = signal<'playbook' | 'nda_standard' | 'clausier' | 'dd_grid' | 'document'>('document');

  // Qualification (playbook only)
  loadingClauses = signal(false);
  documentClauses = signal<Array<{ id: string; type: string; heading: string | null; text: string }>>([]);
  qualifications = signal<Record<string, 'ideal' | 'fallback' | 'red_flag' | 'ignore'>>({});

  qualificationStats = computed(() => {
    const q = this.qualifications();
    const stats = { ideal: 0, fallback: 0, red_flag: 0, ignore: 0 };
    for (const v of Object.values(q)) stats[v]++;
    return stats;
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.refService.list().subscribe(a => this.assets.set(a));
  }

  openCreate() {
    this.selectedDeliverable.set(null);
    this.selectedDocument.set(null);
    this.publishName.set('');
    this.publishDescription.set('');
    this.createTab.set('document');
    this.documentStep.set('pick');
    this.documentRefType.set('document');
    this.documentClauses.set([]);
    this.qualifications.set({});
    this.showCreate.set(true);
    this.loadDocuments();
    this.loadDeliverables();
  }

  private loadDocuments() {
    this.loadingDocuments.set(true);
    this.refService.availableDocuments().subscribe({
      next: (docs) => { this.availableDocuments.set(docs); this.loadingDocuments.set(false); },
      error: () => this.loadingDocuments.set(false),
    });
  }

  private loadDeliverables() {
    this.loadingDeliverables.set(true);
    this.anaService.listAllDeliverables().subscribe({
      next: (dels) => { this.availableDeliverables.set(dels); this.loadingDeliverables.set(false); },
      error: () => this.loadingDeliverables.set(false),
    });
  }

  selectDocument(doc: { legalObjectId: string; fileName: string }) {
    this.selectedDocument.set(doc);
    this.publishName.set(doc.fileName.replace(/\.[^.]+$/, ''));
    this.documentRefType.set('document');
    this.documentStep.set('pick');
  }

  proceedFromPick() {
    if (this.documentRefType() === 'playbook') {
      // Load clauses for qualification
      const doc = this.selectedDocument();
      if (!doc) return;
      this.loadingClauses.set(true);
      this.refService.getLegalObject(doc.legalObjectId).subscribe({
        next: (lo) => {
          const cls = lo.clauses ?? [];
          this.documentClauses.set(cls);
          // Default all clauses to "ideal"
          const defaults: Record<string, 'ideal' | 'fallback' | 'red_flag' | 'ignore'> = {};
          for (const c of cls) defaults[c.id] = 'ideal';
          this.qualifications.set(defaults);
          this.loadingClauses.set(false);
          this.documentStep.set('qualify');
        },
        error: () => this.loadingClauses.set(false),
      });
    } else {
      this.documentStep.set('confirm');
    }
  }

  setQualification(clauseId: string, value: 'ideal' | 'fallback' | 'red_flag' | 'ignore') {
    this.qualifications.update(q => ({ ...q, [clauseId]: value }));
  }

  setAllQualifications(value: 'ideal' | 'fallback' | 'red_flag' | 'ignore') {
    const all: Record<string, 'ideal' | 'fallback' | 'red_flag' | 'ignore'> = {};
    for (const c of this.documentClauses()) all[c.id] = value;
    this.qualifications.set(all);
  }

  qualificationLabel(v: 'ideal' | 'fallback' | 'red_flag' | 'ignore') {
    return { ideal: 'Idéal', fallback: 'Repli', red_flag: 'Red flag', ignore: 'Ignorer' }[v];
  }

  qualificationColor(v: 'ideal' | 'fallback' | 'red_flag' | 'ignore') {
    return {
      ideal: 'bg-green-100 text-green-700 ring-green-400',
      fallback: 'bg-amber-100 text-amber-700 ring-amber-400',
      red_flag: 'bg-red-100 text-red-700 ring-red-400',
      ignore: 'bg-gray-100 text-gray-500 ring-gray-300',
    }[v];
  }

  selectDeliverable(del: DeliverableSummary) {
    this.selectedDeliverable.set(del);
    this.publishName.set(del.name);
  }

  submitFromDocument() {
    const doc = this.selectedDocument();
    if (!doc || !this.publishName().trim()) return;
    this.creating.set(true);
    const isPlaybook = this.documentRefType() === 'playbook';
    this.refService.createFromDocument(
      doc.legalObjectId,
      this.publishName().trim(),
      this.publishDescription().trim() || undefined,
      this.documentRefType(),
      isPlaybook ? this.qualifications() : undefined,
    ).subscribe({
      next: (asset) => {
        this.assets.update(list => [...list, asset]);
        this.selected.set(asset);
        this.showCreate.set(false);
        this.creating.set(false);
      },
      error: () => this.creating.set(false),
    });
  }

  submitFromDeliverable() {
    const del = this.selectedDeliverable();
    if (!del || !this.publishName().trim()) return;
    this.creating.set(true);
    this.anaService.publishDeliverable(del.id, this.publishName().trim(), this.publishDescription().trim() || undefined)
      .subscribe({
        next: (res) => {
          this.refService.get(res.assetId).subscribe(asset => {
            this.assets.update(list => [...list, asset]);
            this.selected.set(asset);
          });
          this.showCreate.set(false);
          this.creating.set(false);
        },
        error: () => this.creating.set(false),
      });
  }

  deleteSelected() {
    const asset = this.selected();
    if (!asset) return;
    if (!confirm(`Supprimer "${asset.name}" ?`)) return;
    this.refService.delete(asset.id).subscribe(() => {
      this.assets.update(list => list.filter(a => a.id !== asset.id));
      this.selected.set(null);
    });
  }

  select(a: ReferenceAsset) {
    this.selected.set(a);
  }

  filtered() {
    const t = this.filterType();
    return t ? this.assets().filter(a => a.type === t) : this.assets();
  }

  uniqueTypes() {
    return [...new Set(this.assets().map(a => a.type))];
  }

  deliverableTypeLabel(type: string) {
    return {
      review_note: 'Note de revue',
      clausier: 'Clausier',
      dd_synthesis: 'Synthèse DD',
      comparative_note: 'Note comparative',
    }[type] ?? type;
  }

  deliverableTypeColor(type: string) {
    return {
      review_note: 'bg-blue-100 text-blue-700',
      clausier: 'bg-violet-100 text-violet-700',
      dd_synthesis: 'bg-green-100 text-green-700',
      comparative_note: 'bg-orange-100 text-orange-700',
    }[type] ?? 'bg-gray-100 text-gray-600';
  }

  typeLabel(type: string) {
    return {
      playbook: 'Playbook',
      nda_standard: 'NDA Standard',
      clausier: 'Clausier',
      dd_grid: 'Grille DD',
    }[type] ?? type;
  }

  typeColor(type: string) {
    return {
      playbook: 'bg-orange-100 text-orange-700',
      nda_standard: 'bg-blue-100 text-blue-700',
      clausier: 'bg-violet-100 text-violet-700',
      dd_grid: 'bg-green-100 text-green-700',
    }[type] ?? 'bg-gray-100 text-gray-600';
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────

  editMode = signal(false);
  editingSections = signal<EditableSection[]>([]);
  saving = signal(false);

  enterEditMode() {
    const asset = this.selected();
    if (!asset) return;
    const sections: EditableSection[] = ((asset.content?.['sections'] as any[]) ?? []).map((s: any) => ({
      clauseType: s.clauseType ?? '',
      stakes: s.stakes ?? '',
      positions: {
        ...(s.positions?.ideal ? { ideal: { description: s.positions.ideal.description } } : {}),
        ...(s.positions?.fallback ? { fallback: { description: s.positions.fallback.description } } : {}),
        ...(s.positions?.redFlag ? { redFlag: { description: s.positions.redFlag.description } } : {}),
      },
      sourceClauseIds: s.sourceClauseIds ?? [],
    }));
    this.editingSections.set(sections);
    this.editMode.set(true);
  }

  cancelEdit() {
    this.editMode.set(false);
    this.editingSections.set([]);
  }

  saveEdit() {
    const asset = this.selected();
    if (!asset) return;
    this.saving.set(true);
    const updatedContent = { ...asset.content, sections: this.editingSections() };
    this.refService.update(asset.id, { content: updatedContent }).subscribe({
      next: (updated) => {
        this.assets.update(list => list.map(a => a.id === updated.id ? updated : a));
        this.selected.set(updated);
        this.editMode.set(false);
        this.editingSections.set([]);
        this.saving.set(false);
      },
      error: () => this.saving.set(false),
    });
  }

  updateSectionField(i: number, field: 'clauseType' | 'stakes', value: string) {
    this.editingSections.update(list => list.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }

  updatePosition(i: number, key: 'ideal' | 'fallback' | 'redFlag', value: string) {
    this.editingSections.update(list => list.map((s, idx) => {
      if (idx !== i) return s;
      const positions = value.trim()
        ? { ...s.positions, [key]: { description: value } }
        : (() => { const p = { ...s.positions }; delete p[key]; return p; })();
      return { ...s, positions };
    }));
  }

  addSection() {
    this.editingSections.update(list => [...list, { clauseType: '', stakes: '', positions: {}, sourceClauseIds: [] }]);
  }

  removeSection(i: number) {
    this.editingSections.update(list => list.filter((_, idx) => idx !== i));
  }

  statusColor(s: string) {
    return { validated: 'bg-green-100 text-green-700', draft: 'bg-amber-100 text-amber-700', archived: 'bg-gray-100 text-gray-500' }[s] ?? 'bg-gray-100 text-gray-500';
  }

  statusLabel(s: string) {
    return { validated: 'Validé', draft: 'Brouillon', archived: 'Archivé' }[s] ?? s;
  }

  formatDate(d: string) {
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  contentPreview(asset: ReferenceAsset): string {
    try {
      return JSON.stringify(asset.content, null, 2).substring(0, 800);
    } catch { return ''; }
  }
}
