import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReferenceBaseService } from '../../core/services/reference-base.service';
import { AnalysisService } from '../../core/services/analysis.service';
import { AmendmentDialogComponent } from './amendment-dialog.component';
import type { ReferenceAsset } from '../../core/models/reference-asset.model';
import type {
  PlaybookContent, PlaybookSection,
  StandardContent, StandardSection, StandardClause,
  ClausierAssetContent, ClausierAssetSection,
  DDGridContent,
  TabularWorkflowContent,
} from '../../core/models/asset-content.model';

// ─── Types locaux ──────────────────────────────────────────────────────────────

type AssetEditType = 'playbook' | 'standard';

interface PlaybookSectionEdit {
  clauseType: string;
  stakes: string;
  ideal: string;
  fallback: string;
  redFlag: string;
}

interface StandardSectionEdit {
  heading: string;
  clauses: Array<{ clauseTypeOntologyId: string; text: string; notes: string }>;
}

interface DeliverableSummary {
  id: string; analysisId: string; type: string; name: string;
  createdAt: string; status: string; currentVersion: number; sourceOperation: string;
}

const PUBLISHABLE_TYPES = ['review_note', 'clausier', 'dd_synthesis', 'comparative_note'];
const SCRATCH_TYPES: Array<{ value: string; label: string; description: string }> = [
  { value: 'playbook', label: 'Playbook', description: 'Positions de négociation par type de clause (idéal / repli / red flag).' },
  { value: 'standard', label: 'Template Contrat', description: 'Clauses modèles organisées par sections, utilisées pour générer un contrat.' },
  { value: 'dd_grid', label: 'Grille DD', description: 'Questionnaire de due diligence organisé par thème.' },
  { value: 'tabular_workflow', label: 'Tabular View Template', description: "Colonnes d'analyse structurée applicables à un type de document." },
];

@Component({
  selector: 'app-reference-base',
  imports: [FormsModule, AmendmentDialogComponent],
  templateUrl: './reference-base.component.html',
})
export class ReferenceBaseComponent implements OnInit {
  private refService = inject(ReferenceBaseService);
  private anaService = inject(AnalysisService);

  // ── Liste & sélection ───────────────────────────────────────────────────────
  assets = signal<ReferenceAsset[]>([]);
  selected = signal<ReferenceAsset | null>(null);
  filterType = signal('');

  uniqueTypes = computed(() => [...new Set(this.assets().map(a => a.type))]);

  groupedAssets = computed(() => {
    const list = this.filterType()
      ? this.assets().filter(a => a.type === this.filterType())
      : this.assets();
    const order = [
      { type: 'playbook', label: 'Playbooks' },
      { type: 'standard', label: 'Templates Contrat' },
      { type: 'clausier', label: 'Clausiers' },
      { type: 'dd_grid', label: 'Grilles DD' },
      { type: 'tabular_workflow', label: 'Tabular View Templates' },
    ];
    const groups: Array<{ label: string; assets: ReferenceAsset[] }> = [];
    for (const { type, label } of order) {
      const items = list.filter(a => a.type === type).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      if (items.length) groups.push({ label, assets: items });
    }
    const known = new Set(order.map(o => o.type));
    const others = list.filter(a => !known.has(a.type)).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    if (others.length) groups.push({ label: 'Autres', assets: others });
    return groups;
  });

  ngOnInit() { this.load(); }

  load() { this.refService.list().subscribe(a => this.assets.set(a)); }

  select(a: ReferenceAsset) {
    this.cancelEdit();
    this.selected.set(a);
  }

  // ── Suppression ─────────────────────────────────────────────────────────────
  deleteSelected() {
    const asset = this.selected();
    if (!asset || !confirm(`Supprimer "${asset.name}" ?`)) return;
    this.refService.delete(asset.id).subscribe(() => {
      this.assets.update(list => list.filter(a => a.id !== asset.id));
      this.selected.set(null);
    });
  }

  // ── Mode édition ────────────────────────────────────────────────────────────
  editMode = signal(false);
  editingPlaybook = signal<PlaybookSectionEdit[]>([]);
  editingStandard = signal<StandardSectionEdit[]>([]);
  saving = signal(false);

  canEdit = computed(() => {
    const t = this.selected()?.type;
    return t === 'playbook' || t === 'standard';
  });

  enterEditMode() {
    const asset = this.selected();
    if (!asset) return;
    if (asset.type === 'playbook') {
      const c = asset.content as PlaybookContent;
      this.editingPlaybook.set((c.sections ?? []).map(s => ({
        clauseType: s.clauseType ?? '',
        stakes: s.stakes ?? '',
        ideal: s.positions?.ideal?.description ?? '',
        fallback: s.positions?.fallback?.description ?? '',
        redFlag: s.positions?.redFlag?.description ?? '',
      })));
    } else if (asset.type === 'standard') {
      const c = asset.content as StandardContent;
      this.editingStandard.set((c.sections ?? []).map(sec => ({
        heading: sec.heading ?? '',
        clauses: (sec.clauses ?? []).map(cl => ({
          clauseTypeOntologyId: cl.clauseTypeOntologyId ?? '',
          text: cl.text ?? '',
          notes: cl.notes ?? '',
        })),
      })));
    }
    this.editMode.set(true);
  }

  cancelEdit() {
    this.editMode.set(false);
    this.editingPlaybook.set([]);
    this.editingStandard.set([]);
  }

  saveEdit() {
    const asset = this.selected();
    if (!asset) return;
    this.saving.set(true);

    let content: unknown;
    if (asset.type === 'playbook') {
      content = {
        sections: this.editingPlaybook().map(s => ({
          clauseType: s.clauseType,
          ...(s.stakes ? { stakes: s.stakes } : {}),
          positions: {
            ...(s.ideal ? { ideal: { description: s.ideal } } : {}),
            ...(s.fallback ? { fallback: { description: s.fallback } } : {}),
            ...(s.redFlag ? { redFlag: { description: s.redFlag } } : {}),
          },
        })),
      };
    } else if (asset.type === 'standard') {
      const existing = asset.content as StandardContent;
      content = {
        schemaVersion: 1 as const,
        documentType: existing.documentType ?? 'Standard',
        sections: this.editingStandard().map((sec, i) => ({
          id: `sec_${i}`,
          heading: sec.heading,
          order: i,
          clauses: sec.clauses.map((cl, j) => ({
            id: `cl_${i}_${j}`,
            clauseTypeOntologyId: cl.clauseTypeOntologyId,
            text: cl.text,
            ...(cl.notes ? { notes: cl.notes } : {}),
          })),
        })),
      };
    }

    this.refService.update(asset.id, { content: content as Record<string, unknown> }).subscribe({
      next: (updated) => {
        this.assets.update(list => list.map(a => a.id === updated.id ? updated : a));
        this.selected.set(updated);
        this.editMode.set(false);
        this.saving.set(false);
      },
      error: () => this.saving.set(false),
    });
  }

  // ── Helpers édition Playbook ─────────────────────────────────────────────────
  addPlaybookSection() {
    this.editingPlaybook.update(l => [...l, { clauseType: '', stakes: '', ideal: '', fallback: '', redFlag: '' }]);
  }
  removePlaybookSection(i: number) {
    this.editingPlaybook.update(l => l.filter((_, idx) => idx !== i));
  }
  updatePlaybookSection(i: number, field: keyof PlaybookSectionEdit, value: string) {
    this.editingPlaybook.update(l => l.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }

  // ── Helpers édition Standard ─────────────────────────────────────────────────
  addStandardSection() {
    this.editingStandard.update(l => [...l, { heading: '', clauses: [] }]);
  }
  removeStandardSection(i: number) {
    this.editingStandard.update(l => l.filter((_, idx) => idx !== i));
  }
  updateStandardSection(i: number, value: string) {
    this.editingStandard.update(l => l.map((s, idx) => idx === i ? { ...s, heading: value } : s));
  }
  addStandardClause(si: number) {
    this.editingStandard.update(l => l.map((s, idx) =>
      idx === si ? { ...s, clauses: [...s.clauses, { clauseTypeOntologyId: '', text: '', notes: '' }] } : s
    ));
  }
  removeStandardClause(si: number, ci: number) {
    this.editingStandard.update(l => l.map((s, idx) =>
      idx === si ? { ...s, clauses: s.clauses.filter((_, cidx) => cidx !== ci) } : s
    ));
  }
  updateStandardClause(si: number, ci: number, field: 'clauseTypeOntologyId' | 'text' | 'notes', value: string) {
    this.editingStandard.update(l => l.map((s, idx) =>
      idx === si ? { ...s, clauses: s.clauses.map((c, cidx) => cidx === ci ? { ...c, [field]: value } : c) } : s
    ));
  }

  // ── Accesseurs de contenu typés ──────────────────────────────────────────────
  playbookSections(asset: ReferenceAsset): PlaybookSection[] {
    return ((asset.content as PlaybookContent)?.sections ?? []);
  }

  standardSections(asset: ReferenceAsset): StandardSection[] {
    return ((asset.content as StandardContent)?.sections ?? []);
  }

  // Standard créé depuis un document: format plat { clauses: [{ type, label, text }] }
  legacyClauses(asset: ReferenceAsset): Array<{ type: string; label: string; text: string }> {
    const c = asset.content as Record<string, unknown>;
    if (!c?.['sections'] && Array.isArray(c?.['clauses'])) {
      return c['clauses'] as Array<{ type: string; label: string; text: string }>;
    }
    return [];
  }

  clausierSections(asset: ReferenceAsset): ClausierAssetSection[] {
    return ((asset.content as ClausierAssetContent)?.sections ?? []);
  }

  ddThemes(asset: ReferenceAsset) {
    return ((asset.content as DDGridContent)?.themes ?? []);
  }

  tabularColumns(asset: ReferenceAsset) {
    return ((asset.content as TabularWorkflowContent)?.columns ?? [])
      .sort((a, b) => a.order - b.order);
  }

  contentPreview(asset: ReferenceAsset): string {
    try { return JSON.stringify(asset.content, null, 2).substring(0, 1000); }
    catch { return ''; }
  }

  // ── Création ────────────────────────────────────────────────────────────────
  showCreate = signal(false);
  createTab = signal<'scratch' | 'document' | 'livrable'>('scratch');
  creating = signal(false);
  publishName = signal('');
  publishDescription = signal('');
  scratchType = signal('playbook');
  readonly scratchTypes = SCRATCH_TYPES;

  // From livrable
  selectedDeliverable = signal<DeliverableSummary | null>(null);
  availableDeliverables = signal<DeliverableSummary[]>([]);
  loadingDeliverables = signal(false);
  filteredDeliverables = computed(() =>
    this.availableDeliverables().filter(d => PUBLISHABLE_TYPES.includes(d.type))
  );

  // From document
  documentStep = signal<'pick' | 'qualify' | 'confirm'>('pick');
  selectedDocument = signal<{ legalObjectId: string; fileName: string } | null>(null);
  availableDocuments = signal<Array<{ legalObjectId: string; documentId: string; fileName: string; workspaceId: string; uploadedAt: string }>>([]);
  loadingDocuments = signal(false);
  documentRefType = signal<'playbook' | 'nda_standard' | 'standard' | 'clausier' | 'dd_grid' | 'document'>('playbook');
  loadingClauses = signal(false);
  documentClauses = signal<Array<{ id: string; type: string; heading: string | null; text: string }>>([]);
  qualifications = signal<Record<string, 'ideal' | 'fallback' | 'red_flag' | 'ignore'>>({});
  qualificationStats = computed(() => {
    const q = this.qualifications();
    const s = { ideal: 0, fallback: 0, red_flag: 0, ignore: 0 };
    for (const v of Object.values(q)) s[v]++;
    return s;
  });

  openCreate() {
    this.showCreate.set(true);
    this.createTab.set('scratch');
    this.publishName.set('');
    this.publishDescription.set('');
    this.scratchType.set('playbook');
    this.selectedDocument.set(null);
    this.selectedDeliverable.set(null);
    this.documentStep.set('pick');
    this.documentRefType.set('playbook');
    this.documentClauses.set([]);
    this.qualifications.set({});
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
    this.documentStep.set('pick');
  }

  proceedFromPick() {
    if (this.documentRefType() === 'playbook') {
      const doc = this.selectedDocument();
      if (!doc) return;
      this.loadingClauses.set(true);
      this.refService.getLegalObject(doc.legalObjectId).subscribe({
        next: (lo) => {
          const cls = lo.clauses ?? [];
          this.documentClauses.set(cls);
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
    const all: Record<string, typeof value> = {};
    for (const c of this.documentClauses()) all[c.id] = value;
    this.qualifications.set(all);
  }

  selectDeliverable(del: DeliverableSummary) {
    this.selectedDeliverable.set(del);
    this.publishName.set(del.name);
  }

  submitFromScratch() {
    const name = this.publishName().trim();
    const type = this.scratchType();
    if (!name) return;
    this.creating.set(true);
    const emptyContent: Record<string, unknown> = {
      playbook: { sections: [] },
      standard: { schemaVersion: 1, documentType: 'Standard', sections: [] },
      dd_grid: { schemaVersion: 1, themes: [] },
      tabular_workflow: { schemaVersion: 1, applicableDocumentTypes: [], columns: [] },
    }[type] ?? { sections: [] };

    this.refService.create({
      type, name, description: this.publishDescription().trim() || undefined,
      content: emptyContent as Record<string, unknown>,
    }).subscribe({
      next: (asset) => {
        this.assets.update(l => [...l, asset]);
        this.selected.set(asset);
        this.showCreate.set(false);
        this.creating.set(false);
        if (asset.type === 'playbook' || asset.type === 'standard') {
          this.enterEditMode();
        }
      },
      error: () => this.creating.set(false),
    });
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
        this.assets.update(l => [...l, asset]);
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
            this.assets.update(l => [...l, asset]);
            this.selected.set(asset);
          });
          this.showCreate.set(false);
          this.creating.set(false);
        },
        error: () => this.creating.set(false),
      });
  }

  // ── Amendements (dialogue proposé depuis une analyse) ──────────────────────
  showAmendmentDialog = signal(false);

  onAmendmentCreated() { /* pas de rechargement ici */ }

  // ── Labels & couleurs ────────────────────────────────────────────────────────
  typeLabel(type: string) {
    return ({
      playbook: 'Playbook', standard: 'Template Contrat', nda_standard: 'Template Contrat',
      clausier: 'Clausier', dd_grid: 'Grille DD', tabular_workflow: 'Tabular View Template',
      document: 'Document',
    } as Record<string, string>)[type] ?? type;
  }

  typeColor(type: string) {
    return ({
      playbook: 'bg-orange-100 text-orange-700',
      standard: 'bg-indigo-100 text-indigo-700',
      nda_standard: 'bg-blue-100 text-blue-700',
      clausier: 'bg-gray-100 text-gray-700',
      dd_grid: 'bg-green-100 text-green-700',
      tabular_workflow: 'bg-violet-100 text-violet-700',
      document: 'bg-gray-100 text-gray-600',
    } as Record<string, string>)[type] ?? 'bg-gray-100 text-gray-600';
  }

  statusLabel(s: string) {
    return ({ validated: 'Validé', draft: 'Brouillon', archived: 'Archivé' } as Record<string, string>)[s] ?? s;
  }

  statusColor(s: string) {
    return ({
      validated: 'bg-green-100 text-green-700',
      draft: 'bg-amber-100 text-amber-700',
      archived: 'bg-gray-100 text-gray-500',
    } as Record<string, string>)[s] ?? 'bg-gray-100 text-gray-500';
  }

  qualificationLabel(v: string) {
    return ({ ideal: 'Idéal', fallback: 'Repli', red_flag: 'Red flag', ignore: 'Ignorer' } as Record<string, string>)[v] ?? v;
  }

  qualificationColor(v: string) {
    return ({
      ideal: 'bg-green-100 text-green-700 ring-green-400',
      fallback: 'bg-amber-100 text-amber-700 ring-amber-400',
      red_flag: 'bg-red-100 text-red-700 ring-red-400',
      ignore: 'bg-gray-100 text-gray-500 ring-gray-300',
    } as Record<string, string>)[v] ?? 'bg-gray-100 text-gray-500 ring-gray-300';
  }

  deliverableTypeLabel(type: string) {
    return ({
      review_note: 'Note de revue', clausier: 'Clausier',
      dd_synthesis: 'Synthèse DD', comparative_note: 'Note comparative',
    } as Record<string, string>)[type] ?? type;
  }

  deliverableTypeColor(type: string) {
    return ({
      review_note: 'bg-blue-100 text-blue-700',
      clausier: 'bg-gray-100 text-gray-800',
      dd_synthesis: 'bg-green-100 text-green-700',
      comparative_note: 'bg-orange-100 text-orange-700',
    } as Record<string, string>)[type] ?? 'bg-gray-100 text-gray-600';
  }

  expectedTypeLabel(t: string) {
    return ({ text: 'Texte', number: 'Nombre', date: 'Date', boolean: 'Oui/Non', enum: 'Liste' } as Record<string, string>)[t] ?? t;
  }

  formatDate(d: string) {
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
