import { Component, EventEmitter, Input, Output, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RedlineComponent } from '../../deliverables/redline/redline.component';
import { ReferenceBaseService } from '../../../../core/services/reference-base.service';
import { AnalysisService } from '../../../../core/services/analysis.service';
import { ApiService } from '../../../../core/services/api.service';
import type { ReferenceAsset } from '../../../../core/models/reference-asset.model';
import type { Deliverable, RedlineContent } from '../../../../core/models/deliverable.model';

@Component({
  selector: 'app-contract-draft-view',
  standalone: true,
  imports: [FormsModule, RedlineComponent],
  host: { class: 'flex-1 flex flex-col overflow-hidden min-h-0 min-w-0' },
  template: `
    <div class="px-5 py-3 border-b border-gray-200 bg-white shrink-0 flex items-center gap-3">
      <span class="text-xs text-gray-500 shrink-0">Standard :</span>
      <select [ngModel]="standardId()" (ngModelChange)="standardId.set($event)"
        class="text-xs px-2 py-1 border border-gray-300 rounded-md bg-white max-w-xs">
        <option [ngValue]="null">— sélectionner —</option>
        @for (s of standards(); track s.id) {
          <option [ngValue]="s.id">{{ s.name }}</option>
        }
      </select>
      <button (click)="generate()" [disabled]="!canGenerate() || generating()" class="btn-primary">
        @if (generating()) { Génération… } @else { Générer le contrat }
      </button>
      @if (lastError()) { <span class="text-xs text-red-600">{{ lastError() }}</span> }
    </div>

    <div class="flex-1 overflow-y-auto p-5 min-h-0">
      <div class="max-w-4xl mx-auto">
        <label class="block text-xs text-gray-600 mb-1">Contexte projet</label>
        <textarea [ngModel]="contextNotes()" (ngModelChange)="contextNotes.set($event)" rows="3"
          placeholder="Décrivez le contexte (parties, durée souhaitée, montant, contraintes spécifiques...)"
          class="input-text mb-4"></textarea>

        @if (redlineDeliverable(); as red) {
          <app-redline [content]="asRedline(red)" [deliverableId]="red.id"
            (deliverableUpdated)="deliverableUpdated.emit(red.id)" />
        } @else {
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
            Aucun contrat généré pour le moment.<br>
            Choisissez un Standard et cliquez sur « Générer le contrat ».
          </div>
        }
      </div>
    </div>
  `,
})
export class ContractDraftViewComponent implements OnInit {
  @Input({ required: true }) deliverables: Deliverable[] = [];
  @Input({ required: true }) anaId = '';
  @Input() initialStandardId: string | null = null;
  @Output() deliverableUpdated = new EventEmitter<string>();
  @Output() reload = new EventEmitter<void>();

  private refService = inject(ReferenceBaseService);
  private anaService = inject(AnalysisService);
  private api = inject(ApiService);

  standards = signal<ReferenceAsset[]>([]);
  standardId = signal<string | null>(null);
  contextNotes = signal('');
  generating = signal(false);
  lastError = signal('');

  ngOnInit() {
    this.refService.list().subscribe(list => {
      this.standards.set(list.filter(a => a.type === 'standard'));
    });
    if (this.initialStandardId) this.standardId.set(this.initialStandardId);
  }

  redlineDeliverable() { return this.deliverables.find(d => d.type === 'redline') ?? null; }
  asRedline(d: Deliverable) { return d.content as RedlineContent; }

  canGenerate() { return !!this.standardId(); }

  generate() {
    const sid = this.standardId();
    if (!sid) return;
    this.generating.set(true);
    this.lastError.set('');
    this.api.http.post(
      `${this.api.base}/analyses/${this.anaId}/draft-contract`,
      { standardId: sid, contextNotes: this.contextNotes() },
    ).subscribe({
      next: () => { this.generating.set(false); this.reload.emit(); },
      error: (err) => {
        this.generating.set(false);
        this.lastError.set(err?.error?.error ?? 'Bientôt disponible — moteur en cours de branchement.');
      },
    });
  }
}
