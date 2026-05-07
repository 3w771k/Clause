import { Component, EventEmitter, Input, Output, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TabularColumn } from '../../../../core/services/analysis.service';

@Component({
  selector: 'app-column-edit-menu',
  standalone: true,
  imports: [FormsModule],
  template: `
  <div class="bg-white border border-gray-200 rounded-lg shadow-lg w-72 p-3 text-xs"
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
    <input [(ngModel)]="label" type="text" maxlength="200"
      class="w-full text-xs border border-gray-200 rounded px-2 py-1.5 mb-3 focus:outline-none focus:ring-1 focus:ring-gray-900" />

    <label class="block text-gray-600 mb-1">Question / prompt</label>
    <textarea [(ngModel)]="question" rows="4" maxlength="2000"
      class="w-full text-xs border border-gray-200 rounded px-2 py-1.5 mb-3 focus:outline-none focus:ring-1 focus:ring-gray-900 resize-y"></textarea>

    <label class="block text-gray-600 mb-1">Type attendu</label>
    <select [(ngModel)]="expectedType"
      class="w-full text-xs border border-gray-200 rounded px-2 py-1.5 mb-3 focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white">
      <option value="text">Texte</option>
      <option value="number">Nombre</option>
      <option value="date">Date</option>
      <option value="enum">Énumération</option>
      <option value="boolean">Booléen</option>
    </select>

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

  @Output() save = new EventEmitter<{ label: string; question: string; expectedType: string; rerun: boolean }>();
  @Output() delete = new EventEmitter<void>();
  @Output() addAfter = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  label = '';
  question = '';
  expectedType = 'text';
  rerun = true;

  confirmDelete = signal(false);

  ngOnInit() {
    this.label = this.column.label;
    this.question = this.column.question;
    this.expectedType = this.column.expectedType ?? 'text';
  }

  questionChanged() { return this.question !== this.column.question; }

  hasChanges() {
    return (
      this.label !== this.column.label ||
      this.question !== this.column.question ||
      this.expectedType !== (this.column.expectedType ?? 'text')
    );
  }

  onSave() {
    if (!this.hasChanges()) return;
    this.save.emit({
      label: this.label.trim(),
      question: this.question.trim(),
      expectedType: this.expectedType,
      rerun: this.rerun && this.question !== this.column.question,
    });
  }
}
