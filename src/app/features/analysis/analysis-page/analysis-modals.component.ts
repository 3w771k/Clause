import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-analysis-modals',
  standalone: true,
  imports: [FormsModule],
  template: `
    <!-- Add document modal -->
    @if (showAddDoc) {
      <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" (click)="closeAddDoc.emit()">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 class="font-semibold text-gray-900 text-sm">Ajouter un document</h2>
            <button (click)="closeAddDoc.emit()" class="text-gray-400 hover:text-gray-600">×</button>
          </div>
          <div class="p-4 space-y-2 max-h-96 overflow-y-auto">
            @for (doc of availableDocs; track doc.id) {
              @if (doc.legalObjectId) {
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-100">
                  <span class="text-sm text-gray-800 truncate flex-1 mr-3">{{ doc.fileName }}</span>
                  <div class="flex gap-2 shrink-0">
                    <button (click)="addDoc.emit({ id: doc.legalObjectId!, role: 'target' })" class="btn-secondary">Cible</button>
                    <button (click)="addDoc.emit({ id: doc.legalObjectId!, role: 'reference' })" class="btn-secondary">Référence</button>
                  </div>
                </div>
              } @else {
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-100 opacity-50">
                  <span class="text-sm text-gray-500 truncate">{{ doc.fileName }}</span>
                  <span class="text-xs text-gray-400">Non extrait</span>
                </div>
              }
            }
          </div>
        </div>
      </div>
    }

    <!-- Refine modal -->
    @if (showRefine) {
      <div class="fixed inset-0 bg-black/30 z-40" (click)="closeRefine.emit()"></div>
      <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] bg-white rounded-lg shadow-2xl z-50 p-6">
        <h3 class="text-base font-semibold text-gray-900 mb-3">Affiner ce livrable</h3>
        <textarea [ngModel]="refineInput" (ngModelChange)="refineInputChange.emit($event)" rows="3"
          placeholder="Ex : Renforce le verdict sur la confidentialité" class="input-text"></textarea>
        <div class="flex gap-2 justify-end mt-4">
          <button (click)="closeRefine.emit()" class="btn-secondary">Annuler</button>
          <button (click)="applyRefine.emit()" [disabled]="!refineInput || refining" class="btn-primary">
            @if (refining) { En cours... } @else { Appliquer }
          </button>
        </div>
      </div>
    }

    <!-- Publish modal -->
    @if (showPublish) {
      <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" (click)="closePublish.emit()">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md" (click)="$event.stopPropagation()">
          <div class="px-5 py-4 border-b border-gray-100"><h2 class="font-semibold text-gray-900 text-sm">Publier comme référentiel</h2></div>
          @if (publishDone) {
            <div class="p-6 text-center">
              <p class="text-sm font-medium text-gray-900 mb-1">Référentiel publié</p>
              <button (click)="closePublish.emit()" class="btn-primary mt-2">Fermer</button>
            </div>
          } @else {
            <div class="p-5 space-y-3">
              <input [ngModel]="publishName" (ngModelChange)="publishNameChange.emit($event)"
                type="text" placeholder="Nom du référentiel" class="input-text" />
              <textarea [ngModel]="publishDescription" (ngModelChange)="publishDescriptionChange.emit($event)"
                rows="3" placeholder="Description (optionnel)" class="input-text"></textarea>
            </div>
            <div class="flex justify-end gap-2 px-5 pb-5">
              <button (click)="closePublish.emit()" class="btn-secondary">Annuler</button>
              <button (click)="submitPublish.emit()" [disabled]="!publishName.trim()" class="btn-primary">Publier</button>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class AnalysisModalsComponent {
  @Input() showAddDoc = false;
  @Input() availableDocs: { id: string; fileName: string; legalObjectId: string | null; legalExtractionStatus: string }[] = [];
  @Output() closeAddDoc = new EventEmitter<void>();
  @Output() addDoc = new EventEmitter<{ id: string; role: 'target' | 'reference' }>();

  @Input() showRefine = false;
  @Input() refineInput = '';
  @Input() refining = false;
  @Output() refineInputChange = new EventEmitter<string>();
  @Output() closeRefine = new EventEmitter<void>();
  @Output() applyRefine = new EventEmitter<void>();

  @Input() showPublish = false;
  @Input() publishName = '';
  @Input() publishDescription = '';
  @Input() publishDone = false;
  @Output() publishNameChange = new EventEmitter<string>();
  @Output() publishDescriptionChange = new EventEmitter<string>();
  @Output() closePublish = new EventEmitter<void>();
  @Output() submitPublish = new EventEmitter<void>();
}
