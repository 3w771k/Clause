import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { ApiService } from '../../../../core/services/api.service';
import type { Analysis } from '../../../../core/models/analysis.model';
import type { Deliverable } from '../../../../core/models/deliverable.model';

@Component({
  selector: 'app-multi-doc-redline-view',
  standalone: true,
  imports: [],
  host: { class: 'flex-1 flex flex-col overflow-hidden min-h-0 min-w-0' },
  template: `
    <div class="px-5 py-3 border-b border-gray-200 bg-white shrink-0 flex items-center gap-3">
      <button (click)="generateAll()" [disabled]="!canGenerate() || generating()" class="btn-primary">
        @if (generating()) { Génération… } @else { Tout générer }
      </button>
      @if (lastError()) { <span class="text-xs text-red-600">{{ lastError() }}</span> }
    </div>

    <div class="flex-1 overflow-y-auto p-5 min-h-0">
      <div class="max-w-4xl mx-auto">
        @if (!analysis?.documents?.length) {
          <p class="text-sm text-gray-400 text-center py-8">Aucun document cible dans cette analyse.</p>
        } @else {
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200 text-xs text-gray-500">
                <th class="text-left px-3 py-2 font-medium">Document cible</th>
                <th class="text-left px-3 py-2 font-medium">Statut</th>
                <th class="text-left px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              @for (doc of analysis?.documents ?? []; track doc.id) {
                <tr class="border-b border-gray-100">
                  <td class="px-3 py-2 text-gray-800">{{ doc.documentName }}</td>
                  <td class="px-3 py-2 text-gray-500">{{ statusFor(doc.id) }}</td>
                  <td class="px-3 py-2">
                    <button (click)="generateOne(doc.id)" class="btn-secondary">Régénérer</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <p class="mt-6 text-xs text-gray-400">
            Multi-doc redline branche le RedlineEngine en mode <code>multi_doc</code>.
            Si le moteur n'est pas encore actif côté backend, les boutons retournent
            « Bientôt disponible ».
          </p>
        }
      </div>
    </div>
  `,
})
export class MultiDocRedlineViewComponent {
  @Input() analysis: Analysis | null = null;
  @Input() deliverables: Deliverable[] = [];
  @Output() reload = new EventEmitter<void>();

  private api = inject(ApiService);

  generating = signal(false);
  lastError = signal('');

  canGenerate() { return !!this.analysis?.documents?.length; }

  statusFor(_docId: string): string {
    const ana = this.analysis;
    if (!ana) return '—';
    const exists = (this.deliverables ?? []).some(d => d.type === 'redline');
    return exists ? 'Généré' : 'En attente';
  }

  generateAll() {
    if (!this.analysis) return;
    this.generating.set(true);
    this.lastError.set('');
    const ids = (this.analysis.documents ?? []).map(d => d.id);
    this.api.http.post(
      `${this.api.base}/analyses/${this.analysis.id}/multi-doc-redline`,
      { sourceRedlineId: null, targetDocumentIds: ids },
    ).subscribe({
      next: () => { this.generating.set(false); this.reload.emit(); },
      error: (err) => {
        this.generating.set(false);
        this.lastError.set(err?.error?.error ?? 'Bientôt disponible — moteur en cours de branchement.');
      },
    });
  }

  generateOne(docId: string) {
    if (!this.analysis) return;
    this.api.http.post(
      `${this.api.base}/analyses/${this.analysis.id}/multi-doc-redline`,
      { sourceRedlineId: null, targetDocumentIds: [docId] },
    ).subscribe({
      next: () => this.reload.emit(),
      error: (err) => this.lastError.set(err?.error?.error ?? 'Bientôt disponible.'),
    });
  }
}
