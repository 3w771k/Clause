import { Component, EventEmitter, Input, Output, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RedlineComponent } from '../../deliverables/redline/redline.component';
import { ReferenceBaseService } from '../../../../core/services/reference-base.service';
import { ApiService } from '../../../../core/services/api.service';
import type { ReferenceAsset } from '../../../../core/models/reference-asset.model';
import type { Analysis } from '../../../../core/models/analysis.model';
import type { Deliverable, RedlineContent } from '../../../../core/models/deliverable.model';

interface ChatTurn { role: 'user' | 'system'; content: string; ts: string; }

@Component({
  selector: 'app-contract-draft-view',
  standalone: true,
  imports: [FormsModule, RedlineComponent],
  host: { class: 'flex-1 flex overflow-hidden min-h-0 min-w-0' },
  template: `
    <!-- Pane gauche : redline du document -->
    <div class="flex-1 flex flex-col overflow-hidden min-w-0">
      <div class="px-5 py-3 border-b border-gray-200 bg-white shrink-0 flex items-center gap-3">
        <span class="text-xs text-gray-500 shrink-0">Standard de référence (optionnel)</span>
        <select [ngModel]="standardId()" (ngModelChange)="standardId.set($event)"
          class="text-xs px-2 py-1 border border-gray-300 rounded-md bg-white max-w-xs">
          <option [ngValue]="null">— libre —</option>
          @for (s of standards(); track s.id) {
            <option [ngValue]="s.id">{{ s.name }}</option>
          }
        </select>
        @if (lastError()) { <span class="text-xs text-red-600 truncate">{{ lastError() }}</span> }
      </div>

      <div class="flex-1 overflow-y-auto p-5 min-h-0">
        <div class="max-w-4xl mx-auto">
          @if (redlineDeliverable(); as red) {
            <app-redline [content]="asRedline(red)" [deliverableId]="red.id"
              (deliverableUpdated)="deliverableUpdated.emit(red.id)" />
          } @else {
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-sm text-gray-500 text-center">
              Aucun redline pour le moment.<br>
              Saisissez une instruction dans le panneau de droite pour commencer à adapter le document.
            </div>
          }
        </div>
      </div>
    </div>

    <!-- Pane droit : chat-to-redline -->
    <div class="w-96 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-100 shrink-0">
        <h3 class="text-sm font-semibold text-gray-800">Chat-to-redline</h3>
        <p class="text-[11px] text-gray-500 mt-0.5">Donnez vos instructions, le moteur génère un redline cumulatif.</p>
      </div>

      <div class="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        @if (turns().length === 0) {
          <div class="text-xs text-gray-400 text-center py-6">
            <p class="mb-3">Exemples d'instructions :</p>
            <div class="space-y-1.5 text-left">
              @for (ex of examples; track ex) {
                <button (click)="instruction.set(ex); send()"
                  class="block w-full text-xs px-3 py-2 rounded-md bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors">
                  {{ ex }}
                </button>
              }
            </div>
          </div>
        }
        @for (t of turns(); track t.ts) {
          <div [class]="t.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
            <div [class]="t.role === 'user'
              ? 'bg-gray-900 text-white rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%]'
              : 'bg-gray-100 text-gray-800 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%]'"
              class="text-xs leading-relaxed whitespace-pre-wrap">{{ t.content }}</div>
          </div>
        }
        @if (generating()) {
          <div class="flex justify-start">
            <div class="bg-gray-100 text-gray-500 rounded-2xl rounded-tl-sm px-3 py-2 text-xs italic">
              Génération en cours…
            </div>
          </div>
        }
      </div>

      <div class="p-3 border-t border-gray-100 shrink-0">
        <div class="flex gap-2">
          <textarea [ngModel]="instruction()" (ngModelChange)="instruction.set($event)"
            (keydown.enter)="$event.preventDefault(); send()" rows="2"
            placeholder="Ex : Réduis le plafond de responsabilité à 12 mois de redevance"
            class="flex-1 text-xs px-2.5 py-2 rounded-md border border-gray-300 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 resize-none"></textarea>
          <button (click)="send()" [disabled]="!instruction().trim() || generating()" class="btn-primary self-end">
            Envoyer
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ContractDraftViewComponent implements OnInit {
  @Input({ required: true }) deliverables: Deliverable[] = [];
  @Input({ required: true }) anaId = '';
  @Input() analysis: Analysis | null = null;
  @Output() deliverableUpdated = new EventEmitter<string>();
  @Output() reload = new EventEmitter<void>();

  private refService = inject(ReferenceBaseService);
  private api = inject(ApiService);

  standards = signal<ReferenceAsset[]>([]);
  standardId = signal<string | null>(null);
  instruction = signal('');
  generating = signal(false);
  turns = signal<ChatTurn[]>([]);
  lastError = signal('');

  readonly examples = [
    'Renforce la clause de confidentialité',
    'Ajoute une clause de force majeure standard',
    'Réduis le plafond de responsabilité à 12 mois',
    'Aligne la juridiction sur le droit français',
  ];

  ngOnInit() {
    this.refService.list().subscribe(list => {
      this.standards.set(list.filter(a => a.type === 'standard'));
    });
  }

  redlineDeliverable() { return this.deliverables.find(d => d.type === 'redline') ?? null; }
  asRedline(d: Deliverable) { return d.content as RedlineContent; }

  send() {
    const instr = this.instruction().trim();
    if (!instr) return;
    this.generating.set(true);
    this.lastError.set('');
    this.turns.update(list => [...list, { role: 'user', content: instr, ts: new Date().toISOString() }]);
    this.instruction.set('');
    this.api.http.post<{ proposalsCount?: number; error?: string }>(
      `${this.api.base}/analyses/${this.anaId}/draft-contract`,
      { standardId: this.standardId(), contextNotes: instr },
    ).subscribe({
      next: (res) => {
        this.generating.set(false);
        const count = res.proposalsCount ?? 0;
        this.turns.update(list => [...list, {
          role: 'system',
          content: count > 0
            ? `${count} proposition(s) ajoutée(s) au redline. Affinez si besoin.`
            : 'Aucune modification proposée. Reformulez votre instruction.',
          ts: new Date().toISOString(),
        }]);
        this.reload.emit();
      },
      error: (err) => {
        this.generating.set(false);
        const detail = err?.error?.error ?? err?.error?.message ?? err?.message ?? `HTTP ${err?.status ?? '?'}`;
        const msg = `Backend a renvoyé : ${detail}`;
        this.lastError.set(msg);
        this.turns.update(list => [...list, { role: 'system', content: `❌ ${msg}`, ts: new Date().toISOString() }]);
        console.error('[contract-draft] backend error:', err);
      },
    });
  }
}
