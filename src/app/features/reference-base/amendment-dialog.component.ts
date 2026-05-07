import { Component, input, output, signal, inject, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReferenceBaseService } from '../../core/services/reference-base.service';
import type { ReferenceAsset } from '../../core/models/reference-asset.model';

@Component({
  selector: 'app-amendment-dialog',
  imports: [FormsModule],
  template: `
<div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" (click)="onClose.emit()">
  <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg" (click)="$event.stopPropagation()">
    <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
      <div>
        <h2 class="font-semibold text-gray-900 text-sm">Proposer un amendement</h2>
        <p class="text-xs text-gray-400 mt-0.5">{{ asset().name }}</p>
      </div>
      <button (click)="onClose.emit()" class="text-gray-400 hover:text-gray-600">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <div class="p-5 space-y-4">
      <!-- Clause type -->
      <div>
        <label class="block text-xs font-semibold text-gray-700 mb-1.5">Type de clause</label>
        @if (availableClauseTypes().length > 0) {
          <select [ngModel]="clauseType()" (ngModelChange)="clauseType.set($event)"
            class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-indigo-400">
            <option value="">Sélectionner...</option>
            @for (ct of availableClauseTypes(); track ct) {
              <option [value]="ct">{{ ct }}</option>
            }
          </select>
        } @else {
          <input [ngModel]="clauseType()" (ngModelChange)="clauseType.set($event)"
            placeholder="Ex: Limitation de responsabilité"
            class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-indigo-400" />
        }
      </div>

      <!-- Field -->
      <div>
        <label class="block text-xs font-semibold text-gray-700 mb-1.5">Champ à modifier</label>
        <select [ngModel]="field()" (ngModelChange)="field.set($event)"
          class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-indigo-400">
          <option value="ideal">Position idéale</option>
          <option value="fallback">Repli acceptable</option>
          <option value="redFlag">Red flag</option>
          <option value="stakes">Enjeux</option>
        </select>
      </div>

      <!-- Proposed value -->
      <div>
        <label class="block text-xs font-semibold text-gray-700 mb-1.5">Nouvelle valeur proposée</label>
        <textarea [ngModel]="proposedValue()" (ngModelChange)="proposedValue.set($event)"
          rows="4" placeholder="Décrire la position ou valeur proposée..."
          class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-indigo-400 resize-none">
        </textarea>
      </div>

      <!-- Rationale -->
      <div>
        <label class="block text-xs font-semibold text-gray-700 mb-1.5">Justification <span class="font-normal text-gray-400">(optionnel)</span></label>
        <textarea [ngModel]="rationale()" (ngModelChange)="rationale.set($event)"
          rows="2" placeholder="Pourquoi cet amendement est-il nécessaire ?"
          class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-indigo-400 resize-none">
        </textarea>
      </div>
    </div>

    <div class="flex justify-end gap-3 px-5 pb-5">
      <button (click)="onClose.emit()"
        class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
        Annuler
      </button>
      <button (click)="submit()" [disabled]="!canSubmit() || submitting()"
        class="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-lg transition-colors">
        @if (submitting()) { En cours... } @else { Proposer l'amendement }
      </button>
    </div>
  </div>
</div>
  `,
})
export class AmendmentDialogComponent {
  asset = input.required<ReferenceAsset>();
  sourceAnalysisId = input<string | null>(null);
  sourceDeliverableId = input<string | null>(null);
  onClose = output<void>();
  onCreated = output<void>();

  private refService = inject(ReferenceBaseService);

  clauseType = signal('');
  field = signal<'ideal' | 'fallback' | 'redFlag' | 'stakes'>('ideal');
  proposedValue = signal('');
  rationale = signal('');
  submitting = signal(false);

  canSubmit = computed(() => !!this.clauseType().trim() && !!this.proposedValue().trim());

  availableClauseTypes = computed(() => {
    const content = this.asset().content as { sections?: Array<{ clauseType: string }> } | null;
    return (content?.sections ?? []).map(s => s.clauseType).filter(Boolean);
  });

  submit() {
    if (!this.canSubmit() || this.submitting()) return;
    this.submitting.set(true);
    this.refService.proposeAmendment(this.asset().id, {
      clauseType: this.clauseType(),
      field: this.field(),
      proposedValue: this.proposedValue(),
      rationale: this.rationale() || undefined,
      sourceAnalysisId: this.sourceAnalysisId() ?? undefined,
      sourceDeliverableId: this.sourceDeliverableId() ?? undefined,
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.onCreated.emit();
        this.onClose.emit();
      },
      error: () => this.submitting.set(false),
    });
  }
}
