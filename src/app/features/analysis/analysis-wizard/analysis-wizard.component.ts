import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DocumentService } from '../../../core/services/document.service';
import { AnalysisService } from '../../../core/services/analysis.service';
import { ReferenceBaseService } from '../../../core/services/reference-base.service';
import type { Document } from '../../../core/models/document.model';
import type { ReferenceAsset } from '../../../core/models/reference-asset.model';

type Operation = 'confrontation' | 'alignment' | 'aggregation' | 'dd' | 'unclear' | 'ma_mapping' | 'deadlines' | 'compliance' | 'inconsistencies';

@Component({
  selector: 'app-analysis-wizard',
  imports: [FormsModule],
  templateUrl: './analysis-wizard.component.html',
})
export class AnalysisWizardComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private docService = inject(DocumentService);
  private anaService = inject(AnalysisService);
  private refService = inject(ReferenceBaseService);

  wsId = '';
  step = signal<1 | 2 | 3>(1);
  operation = signal<Operation | null>(null);

  documents = signal<Document[]>([]);
  referenceAssets = signal<ReferenceAsset[]>([]);

  // Step 2 selections
  selectedTargetDocIds = signal<Set<string>>(new Set());
  selectedRefDocId = signal<string | null>(null);   // alignment: reference document
  selectedRefAssetId = signal<string | null>(null); // confrontation: reference asset

  // Step 3
  analysisName = signal('');
  launching = signal(false);
  error = signal<string | null>(null);

  // NL input (V2)
  nlInput = signal('');
  parsingIntent = signal(false);
  intentError = signal<string | null>(null);
  intentClarification = signal<string | null>(null);

  readyDocs = computed(() => this.documents().filter(d => d.legalExtractionStatus === 'done' && d.legalObjectId));

  ngOnInit() {
    this.wsId = this.route.snapshot.paramMap.get('wsId')!;
    this.docService.list(this.wsId).subscribe(docs => this.documents.set(docs));
    this.refService.list().subscribe(assets => this.referenceAssets.set(assets));
  }

  selectOperation(op: Operation) {
    this.operation.set(op);
    this.selectedTargetDocIds.set(new Set());
    this.selectedRefDocId.set(null);
    this.selectedRefAssetId.set(null);
    this.step.set(2);
  }

  toggleTargetDoc(docId: string) {
    const op = this.operation();
    if (op === 'confrontation') {
      this.selectedTargetDocIds.set(new Set([docId]));
    } else if (op === 'alignment') {
      this.selectedTargetDocIds.set(new Set([docId]));
      if (this.selectedRefDocId() === docId) this.selectedRefDocId.set(null);
    } else {
      const s = new Set(this.selectedTargetDocIds());
      if (s.has(docId)) s.delete(docId); else s.add(docId);
      this.selectedTargetDocIds.set(s);
    }
  }

  canProceedStep2 = computed(() => {
    const op = this.operation();
    const targets = this.selectedTargetDocIds();
    if (!op) return false;
    if (op === 'confrontation') return targets.size === 1;
    if (op === 'alignment') return targets.size === 1 && this.selectedRefDocId() !== null;
    if (op === 'aggregation') return targets.size >= 1;
    if (op === 'dd') return targets.size >= 1;
    if (op === 'ma_mapping') return targets.size >= 1;
    if (op === 'deadlines') return targets.size >= 1;
    if (op === 'compliance') return targets.size >= 1;
    if (op === 'inconsistencies') return targets.size >= 2;
    return true; // unclear
  });

  goToStep3() {
    if (!this.canProceedStep2()) return;
    this.analysisName.set(this.autoName());
    this.step.set(3);
  }

  private autoName(): string {
    const op = this.operation();
    const docs = this.readyDocs();
    const [targetId] = [...this.selectedTargetDocIds()];
    const targetDoc = docs.find(d => d.id === targetId);
    const targetName = targetDoc ? this.baseName(targetDoc.fileName) : '';

    if (op === 'confrontation') {
      const asset = this.referenceAssets().find(a => a.id === this.selectedRefAssetId());
      return asset ? `Audit ${targetName} / ${this.baseName(asset.name)}` : `Audit ${targetName}`;
    }
    if (op === 'alignment') {
      const refDoc = docs.find(d => d.id === this.selectedRefDocId());
      return refDoc ? `Comparaison ${targetName} / ${this.baseName(refDoc.fileName)}` : `Comparaison ${targetName}`;
    }
    if (op === 'aggregation') {
      const month = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return `Clausier ${month}`;
    }
    if (op === 'dd') {
      return 'Due Diligence ' + new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    }
    if (op === 'ma_mapping') {
      const month = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return `Cartographie M&A — ${month}`;
    }
    if (op === 'deadlines') {
      const month = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return `Échéances contractuelles — ${month}`;
    }
    if (op === 'compliance') {
      const asset = this.referenceAssets().find(a => a.id === this.selectedRefAssetId());
      const month = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return asset ? `Conformité ${this.baseName(asset.name)} — ${month}` : `Audit conformité — ${month}`;
    }
    if (op === 'inconsistencies') {
      const count = this.selectedTargetDocIds().size;
      return `Incohérences — ${count} contrats`;
    }
    return `Analyse ${new Date().toLocaleDateString('fr-FR')}`;
  }

  private baseName(fileName: string) {
    return fileName.replace(/\.[^.]+$/, '');
  }

  async launch() {
    const name = this.analysisName().trim();
    if (!name || this.launching()) return;
    this.launching.set(true);
    this.error.set(null);

    const op = this.operation()!;
    const refAssetId = (op === 'confrontation' || op === 'compliance') ? this.selectedRefAssetId() ?? undefined : undefined;

    this.anaService.create(this.wsId, name, op, refAssetId ?? undefined).subscribe({
      next: async (ana) => {
        const docs = this.readyDocs();
        const addOps: Promise<void>[] = [];

        for (const docId of this.selectedTargetDocIds()) {
          const doc = docs.find(d => d.id === docId);
          if (!doc?.legalObjectId) continue;
          addOps.push(new Promise<void>((res, rej) => {
            this.anaService.addDocument(this.wsId, ana.id, doc.legalObjectId!, 'target')
              .subscribe({ next: () => res(), error: rej });
          }));
        }

        if (op === 'alignment' && this.selectedRefDocId()) {
          const refDoc = docs.find(d => d.id === this.selectedRefDocId());
          if (refDoc?.legalObjectId) {
            addOps.push(new Promise<void>((res, rej) => {
              this.anaService.addDocument(this.wsId, ana.id, refDoc.legalObjectId!, 'reference')
                .subscribe({ next: () => res(), error: rej });
            }));
          }
        }

        try {
          await Promise.all(addOps);
        } catch {
          this.error.set('Erreur lors de l\'ajout des documents.');
          this.launching.set(false);
          return;
        }

        this.anaService.startGeneration(this.wsId, ana.id).subscribe({
          next: () => {
            this.router.navigate(['/workspaces', this.wsId, 'analyses', ana.id]);
          },
          error: () => {
            this.router.navigate(['/workspaces', this.wsId, 'analyses', ana.id]);
          },
        });
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? 'Erreur lors de la création.');
        this.launching.set(false);
      },
    });
  }

  cancel() {
    this.router.navigate(['/workspaces', this.wsId]);
  }

  parseNlIntent() {
    const message = this.nlInput().trim();
    if (!message) return;
    this.parsingIntent.set(true);
    this.intentError.set(null);
    this.intentClarification.set(null);

    this.anaService.parseIntent(this.wsId, message).subscribe({
      next: intent => {
        this.parsingIntent.set(false);
        if (intent.clarificationNeeded) {
          this.intentClarification.set(intent.clarificationNeeded);
          return;
        }
        if (intent.operation === 'unclear') {
          this.intentError.set("Je n'ai pas su interpréter votre demande. Précisez ou choisissez une opération ci-dessous.");
          return;
        }
        // Pré-remplir le wizard
        const docs = this.readyDocs();
        const validIds = new Set(docs.map(d => d.id));
        const validRefIds = new Set(this.referenceAssets().map(a => a.id));

        this.operation.set(intent.operation as Operation);
        this.selectedTargetDocIds.set(new Set(intent.targetDocumentIds.filter(id => validIds.has(id))));
        this.selectedRefDocId.set(intent.referenceDocumentId && validIds.has(intent.referenceDocumentId) ? intent.referenceDocumentId : null);
        this.selectedRefAssetId.set(intent.referenceAssetId && validRefIds.has(intent.referenceAssetId) ? intent.referenceAssetId : null);
        this.analysisName.set(intent.suggestedName || this.autoName());
        this.step.set(3);
      },
      error: () => {
        this.parsingIntent.set(false);
        this.intentError.set("Erreur lors de l'analyse de la demande. Réessayez ou choisissez une opération.");
      },
    });
  }

  operationLabel(op: Operation) {
    return {
      confrontation: 'Audit contractuel',
      alignment: 'Comparaison',
      aggregation: 'Clausier',
      dd: 'Due Diligence',
      ma_mapping: 'Cartographie M&A',
      deadlines: 'Échéances contractuelles',
      compliance: 'Conformité réglementaire',
      inconsistencies: 'Incohérences inter-contrats',
      unclear: 'Démarrage libre',
    }[op];
  }

  stepLabel(s: 1 | 2 | 3) {
    return ['Type d\'analyse', 'Documents', 'Confirmation'][s - 1];
  }
}
