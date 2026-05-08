import { Component, EventEmitter, Input, Output, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TabularColumn } from '../../../../core/services/analysis.service';

export interface ClauseTypePreview {
  type: string;
  occurrences: number;
  attributeKeys: string[];
  sampleText: string;
}

export interface ColumnSavePayload {
  label: string;
  question: string;
  expectedType: string;
  extractionStrategy?: 'llm_only' | 'attribute_first' | 'clause_filtered_llm';
  clauseTypeOntologyId?: string | null;
  attributePath?: string | null;
  rerun: boolean;
}

@Component({
  selector: 'app-column-edit-menu',
  standalone: true,
  imports: [FormsModule],
  template: `
  <div class="bg-white border border-gray-200 rounded-lg shadow-lg w-80 p-3 text-xs max-h-[80vh] overflow-y-auto"
    (click)="$event.stopPropagation()">

    <div class="flex items-center justify-between mb-2">
      <span class="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Édition de colonne</span>
      <button (click)="close.emit()" class="text-gray-300 hover:text-gray-500" title="Fermer">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <label class="block text-gray-600 mb-1">Nom</label>
    <input [ngModel]="label()" (ngModelChange)="label.set($event)" type="text" maxlength="200"
      class="w-full text-xs border border-gray-200 rounded px-2 py-1.5 mb-3 focus:outline-none focus:ring-1 focus:ring-gray-900" />

    <label class="block text-gray-600 mb-1">Question / prompt</label>
    <textarea [ngModel]="question()" (ngModelChange)="question.set($event)" rows="3" maxlength="2000"
      class="w-full text-xs border border-gray-200 rounded px-2 py-1.5 mb-3 focus:outline-none focus:ring-1 focus:ring-gray-900 resize-y"></textarea>

    <label class="block text-gray-600 mb-1">Type attendu</label>
    <select [ngModel]="expectedType()" (ngModelChange)="expectedType.set($event)"
      class="w-full text-xs border border-gray-200 rounded px-2 py-1.5 mb-3 focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white">
      <option value="text">Texte</option>
      <option value="number">Nombre</option>
      <option value="date">Date</option>
      <option value="enum">Énumération</option>
      <option value="boolean">Booléen</option>
    </select>

    <!-- Section Avancé : stratégie d'extraction (Brief E) -->
    <button (click)="showAdvanced.set(!showAdvanced())"
      class="w-full flex items-center justify-between text-[11px] text-gray-500 hover:text-gray-700 px-1 py-1.5 mb-2 transition-colors">
      <span>Avancé : stratégie d'extraction</span>
      <svg class="w-3 h-3 transition-transform" [class.rotate-180]="showAdvanced()" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
      </svg>
    </button>

    @if (showAdvanced()) {
      <div class="mb-3 space-y-2 bg-gray-50 -mx-3 px-3 py-2 border-y border-gray-100">
        <div>
          <label class="block text-gray-600 mb-1 text-[11px]">Stratégie</label>
          <select [ngModel]="extractionStrategy()" (ngModelChange)="extractionStrategy.set($event)"
            class="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white">
            <option value="llm_only">LLM seul (sur tout le doc) — défaut</option>
            <option value="attribute_first">Attribut direct (lookup, fallback LLM)</option>
            <option value="clause_filtered_llm">LLM filtré sur 1 type de clause</option>
          </select>
          <p class="text-[10px] text-gray-500 mt-1 leading-snug">
            @if (extractionStrategy() === 'attribute_first') {
              ⚡ Lit directement l'attribut extrait (rapide, gratuit). Tombe sur LLM si l'attribut est absent.
            } @else if (extractionStrategy() === 'clause_filtered_llm') {
              Filtre les clauses par type avant l'appel LLM (économie tokens, plus précis).
            } @else {
              Envoie tout le document au LLM (comportement actuel).
            }
          </p>
        </div>

        @if (extractionStrategy() !== 'llm_only') {
          <div>
            <label class="block text-gray-600 mb-1 text-[11px]">Type de clause à cibler</label>
            <select [ngModel]="clauseTypeOntologyId()" (ngModelChange)="onClauseTypeChange($event)"
              class="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white">
              <option [ngValue]="''">— Sélectionner —</option>
              @for (ct of clauseTypes; track ct.type) {
                <option [ngValue]="ct.type">{{ ct.type }} ({{ ct.occurrences }}×)</option>
              }
            </select>
          </div>

          @if (extractionStrategy() === 'attribute_first') {
            <div>
              <label class="block text-gray-600 mb-1 text-[11px]">Chemin de l'attribut</label>
              <input [ngModel]="attributePath()" (ngModelChange)="attributePath.set($event)" type="text"
                placeholder="ex : cap_amount ou positions.ideal.description"
                class="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white" />
              @if (selectedClauseAttributes().length) {
                <div class="flex gap-1 mt-1.5 flex-wrap">
                  @for (k of selectedClauseAttributes(); track k) {
                    <button (click)="attributePath.set(k)"
                      class="text-[10px] bg-white hover:bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded text-gray-700 transition-colors">{{ k }}</button>
                  }
                </div>
              } @else if (clauseTypeOntologyId()) {
                <p class="text-[10px] text-gray-400 mt-1">Aucun attribut connu pour ce type de clause.</p>
              }
            </div>
          }
        }
      </div>
    }

    @if (questionChanged()) {
      <label class="flex items-center gap-2 mb-3 text-gray-700 cursor-pointer">
        <input type="checkbox" [(ngModel)]="rerun" class="w-3.5 h-3.5" />
        <span>Recalculer les cellules après modification</span>
      </label>
    }

    <div class="flex items-center gap-2 mb-2">
      <button (click)="onSave()" [disabled]="!hasChanges()"
        class="flex-1 text-xs font-medium px-3 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors">
        Sauvegarder
      </button>
      <button (click)="addAfter.emit()"
        class="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
        title="Ajouter une colonne après celle-ci">+</button>
    </div>

    @if (!confirmDelete()) {
      <button (click)="confirmDelete.set(true)"
        class="w-full text-xs px-3 py-1.5 rounded text-red-600 hover:bg-red-50 transition-colors">
        Supprimer la colonne
      </button>
    } @else {
      <div class="flex items-center gap-2">
        <span class="text-[11px] text-gray-600 flex-1">Confirmer ?</span>
        <button (click)="delete.emit(); confirmDelete.set(false)"
          class="text-xs px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors">
          Supprimer
        </button>
        <button (click)="confirmDelete.set(false)"
          class="text-xs px-2 py-1.5 text-gray-500 hover:text-gray-700">Annuler</button>
      </div>
    }
  </div>
  `,
})
export class ColumnEditMenuComponent implements OnInit {
  @Input({ required: true }) column!: TabularColumn;
  @Input() position = 0;
  @Input() clauseTypes: ClauseTypePreview[] = [];

  @Output() save = new EventEmitter<ColumnSavePayload>();
  @Output() delete = new EventEmitter<void>();
  @Output() addAfter = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  label = signal('');
  question = signal('');
  expectedType = signal('text');
  extractionStrategy = signal<'llm_only' | 'attribute_first' | 'clause_filtered_llm'>('llm_only');
  clauseTypeOntologyId = signal<string>('');
  attributePath = signal<string>('');
  rerun = true;

  confirmDelete = signal(false);
  showAdvanced = signal(false);

  ngOnInit() {
    this.label.set(this.column.label);
    this.question.set(this.column.question);
    this.expectedType.set(this.column.expectedType ?? 'text');
    this.extractionStrategy.set(this.column.extractionStrategy ?? 'llm_only');
    this.clauseTypeOntologyId.set(this.column.clauseTypeOntologyId ?? '');
    this.attributePath.set(this.column.attributePath ?? '');
    if (this.column.extractionStrategy && this.column.extractionStrategy !== 'llm_only') {
      this.showAdvanced.set(true);
    }
  }

  onClauseTypeChange(v: string) {
    this.clauseTypeOntologyId.set(v);
    // Reset attributePath if previous attribute doesn't exist on the new clause type
    const attrs = this.selectedClauseAttributes();
    if (this.attributePath() && !attrs.includes(this.attributePath())) {
      this.attributePath.set('');
    }
  }

  selectedClauseAttributes(): string[] {
    const t = this.clauseTypeOntologyId();
    if (!t) return [];
    return this.clauseTypes.find(c => c.type === t)?.attributeKeys ?? [];
  }

  questionChanged() { return this.question() !== this.column.question; }

  hasChanges() {
    return (
      this.label() !== this.column.label ||
      this.question() !== this.column.question ||
      this.expectedType() !== (this.column.expectedType ?? 'text') ||
      this.extractionStrategy() !== (this.column.extractionStrategy ?? 'llm_only') ||
      this.clauseTypeOntologyId() !== (this.column.clauseTypeOntologyId ?? '') ||
      this.attributePath() !== (this.column.attributePath ?? '')
    );
  }

  onSave() {
    if (!this.hasChanges()) return;
    this.save.emit({
      label: this.label().trim(),
      question: this.question().trim(),
      expectedType: this.expectedType(),
      extractionStrategy: this.extractionStrategy(),
      clauseTypeOntologyId: this.clauseTypeOntologyId() || null,
      attributePath: this.attributePath() || null,
      rerun: this.rerun && (
        this.question() !== this.column.question ||
        this.extractionStrategy() !== (this.column.extractionStrategy ?? 'llm_only') ||
        this.clauseTypeOntologyId() !== (this.column.clauseTypeOntologyId ?? '') ||
        this.attributePath() !== (this.column.attributePath ?? '')
      ),
    });
  }
}
