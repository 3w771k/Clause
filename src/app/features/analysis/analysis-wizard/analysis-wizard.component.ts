import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DocumentService } from '../../../core/services/document.service';
import { AnalysisService } from '../../../core/services/analysis.service';
import { ReferenceBaseService } from '../../../core/services/reference-base.service';
import type { Document } from '../../../core/models/document.model';
import type { ReferenceAsset } from '../../../core/models/reference-asset.model';

// R4 (refacto post-Brief 7) : Wizard utilise les 5 viewTypes uniquement.
// Les opérations legacy (aggregation, dd, ma_mapping, deadlines, compliance,
// inconsistencies, unclear) sont mappées vers tabular au moment de la création.
// Les valeurs Operation transitoires confrontation/alignment sont conservées
// car elles déclenchent les pipelines runConfrontation/runAlignment dans
// start-generation côté backend.
type Operation = 'tabular' | 'confrontation' | 'alignment' | 'multi_doc_redline' | 'template_contract';

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
    if (op === 'template_contract') return this.selectedRefAssetId() !== null;
    if (op === 'confrontation') return targets.size === 1 && this.selectedRefAssetId() !== null;
    if (op === 'alignment') return targets.size === 1 && this.selectedRefDocId() !== null;
    if (op === 'multi_doc_redline') return targets.size >= 1;
    if (op === 'tabular') return targets.size >= 1;
    return true;
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

    const month = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    if (op === 'template_contract') {
      const asset = this.referenceAssets().find(a => a.id === this.selectedRefAssetId());
      return asset ? `Contrat depuis ${this.baseName(asset.name)} — ${month}` : `Contrat depuis template — ${month}`;
    }
    if (op === 'confrontation') {
      const asset = this.referenceAssets().find(a => a.id === this.selectedRefAssetId());
      return asset ? `Audit ${targetName} / ${this.baseName(asset.name)}` : `Audit ${targetName}`;
    }
    if (op === 'alignment') {
      const refDoc = docs.find(d => d.id === this.selectedRefDocId());
      return refDoc ? `Comparaison ${targetName} / ${this.baseName(refDoc.fileName)}` : `Comparaison ${targetName}`;
    }
    if (op === 'tabular') {
      const count = this.selectedTargetDocIds().size;
      return `Tableau d'analyse — ${count} doc${count > 1 ? 's' : ''} — ${month}`;
    }
    if (op === 'multi_doc_redline') {
      const count = this.selectedTargetDocIds().size;
      return `Redline propagé — ${count} doc${count > 1 ? 's' : ''}`;
    }
    return `Analyse ${month}`;
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
    // refAsset attaché à l'analyse pour les opérations qui consomment un asset de référence
    const refAssetId = (op === 'confrontation' || op === 'template_contract')
      ? this.selectedRefAssetId() ?? undefined : undefined;

    this.anaService.create(this.wsId, name, op, refAssetId ?? undefined).subscribe({
      next: async (ana) => {
        // template_contract : pas de document, pas de startGeneration — on va directement à la page
        if (op === 'template_contract') {
          this.router.navigate(['/workspaces', this.wsId, 'analyses', ana.id]);
          return;
        }

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

        this.operation.set(this.normalizeOperation(intent.operation));
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
      tabular: 'Analyse structurée',
      confrontation: 'Audit de conformité',
      alignment: 'Comparaison',
      multi_doc_redline: 'Redline multi-documents',
      template_contract: 'Créer depuis un template',
    }[op];
  }

  templateAssets() {
    return this.referenceAssets().filter(a => ['standard', 'playbook', 'clausier'].includes(a.type));
  }

  // R4 — mapping legacy operation (NLU peut renvoyer aggregation/dd/ma_mapping/etc.) → Operation actuelle
  private normalizeOperation(op: string | undefined | null): Operation {
    switch (op) {
      case 'tabular':
      case 'confrontation':
      case 'alignment':
      case 'multi_doc_redline':
      case 'template_contract':
        return op;
      // Toutes les opérations legacy tombent dans tabular (mapping Brief 7)
      default:
        return 'tabular';
    }
  }

  stepLabel(s: 1 | 2 | 3) {
    return ['Type d\'analyse', 'Documents', 'Confirmation'][s - 1];
  }
}
