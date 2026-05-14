// Contract Composer (Brief L) — édition clause-par-clause assistée par LLM.
// Le doc source est découpé en clauses extraites. Pour chaque clause, l'user
// peut ouvrir un mini-chat qui produit des proposals (track-changes) appliquées
// inline. Accept/reject par proposal. La version "working" de chaque clause est
// persistée côté backend dans un deliverable type=contract_draft.

import { Component, EventEmitter, Input, Output, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AnalysisService, ComposerState, ComposerClause, ComposerProposal } from '../../../../core/services/analysis.service';
import { ReferenceBaseService } from '../../../../core/services/reference-base.service';
import type { ReferenceAsset } from '../../../../core/models/reference-asset.model';

@Component({
  selector: 'app-contract-composer-view',
  standalone: true,
  imports: [FormsModule],
  host: { class: 'flex-1 flex overflow-hidden min-h-0 min-w-0' },
  template: `
    <!-- Pane gauche : clauses cards avec track-changes inline -->
    <div class="flex-1 flex flex-col overflow-hidden min-w-0 bg-gray-50">
      <div class="px-5 py-3 border-b border-gray-200 bg-white shrink-0 flex items-center gap-3">
        <span class="text-xs text-gray-500 shrink-0">Standard de référence</span>
        <select [ngModel]="state()?.standardId ?? null" (ngModelChange)="setStandard($event)"
          class="text-xs px-2 py-1 border border-gray-300 rounded-md bg-white max-w-xs">
          <option [ngValue]="null">— libre —</option>
          @for (s of standards(); track s.id) {
            <option [ngValue]="s.id">{{ s.name }}</option>
          }
        </select>
        <div class="flex-1"></div>
        <span class="text-[11px] text-gray-500">
          {{ state()?.clauses?.length ?? 0 }} clause{{ (state()?.clauses?.length ?? 0) > 1 ? 's' : '' }}
          · {{ totalPendingProposals() }} proposition{{ totalPendingProposals() > 1 ? 's' : '' }} en attente
        </span>
        <button (click)="reset()" class="btn-secondary" title="Repartir du document source">
          ↺ Reset
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-5 min-h-0">
        @if (loading()) {
          <p class="text-sm text-gray-400 text-center py-10">Chargement du composer…</p>
        } @else if (state()?.clauses?.length) {
          <div class="max-w-4xl mx-auto space-y-3">
            @for (clause of state()!.clauses; track clause.id) {
              <div class="bg-white border rounded-xl transition-all"
                [class.border-gray-200]="focusedClauseId() !== clause.id"
                [class.border-gray-700]="focusedClauseId() === clause.id"
                [class.shadow-md]="focusedClauseId() === clause.id">
                <button (click)="setFocus(clause.id)"
                  class="w-full text-left px-4 pt-3 pb-1 flex items-center gap-2 hover:bg-gray-50 rounded-t-xl">
                  @if (clause.sequenceNumber) {
                    <span class="text-[11px] font-mono text-gray-400">{{ clause.sequenceNumber }}</span>
                  }
                  <span class="text-xs font-semibold text-gray-700">{{ clause.heading || clause.type }}</span>
                  <span class="text-[10px] text-gray-400">{{ clause.type }}</span>
                  @if (clause.pendingProposals.length) {
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium ml-1">
                      {{ clause.pendingProposals.length }} pending
                    </span>
                  }
                  @if (clause.workingText !== clause.baseText) {
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">modifiée</span>
                  }
                </button>

                <div class="px-4 pb-4">
                  <!-- Texte de la clause avec proposals appliquées inline -->
                  <div class="text-sm text-gray-800 leading-relaxed prose max-w-none"
                    [innerHTML]="renderClauseHtml(clause)"></div>

                  <!-- Liste des proposals pending sur cette clause -->
                  @if (clause.pendingProposals.length) {
                    <div class="mt-3 space-y-2 border-t border-gray-100 pt-3">
                      @for (p of clause.pendingProposals; track p.id) {
                        <div class="bg-amber-50/50 border border-amber-200 rounded-md p-2.5 text-xs">
                          <div class="flex items-center gap-2 mb-1">
                            <span [class]="severityClass(p.severity)" class="text-[10px] px-1.5 py-0.5 rounded font-semibold">{{ p.severity }}</span>
                            <span class="text-gray-600">{{ p.action }}</span>
                          </div>
                          @if (p.action === 'replace') {
                            <div class="mb-1">
                              <span class="del">{{ p.originalText }}</span>
                              <span class="text-gray-400 mx-1">→</span>
                              <span class="ins">{{ p.proposedText }}</span>
                            </div>
                          } @else if (p.action === 'insert') {
                            <div class="ins mb-1">{{ p.proposedText }}</div>
                          } @else if (p.action === 'delete') {
                            <div class="del mb-1">{{ p.originalText }}</div>
                          } @else {
                            <div class="text-gray-700 italic mb-1">{{ p.rationale }}</div>
                          }
                          <p class="text-gray-500 italic text-[11px]">{{ p.rationale }}</p>
                          <div class="flex gap-2 mt-2">
                            <button (click)="acceptProposal(clause, p)" [disabled]="processing() === p.id"
                              class="px-2 py-1 text-[11px] font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded transition-colors disabled:opacity-50">
                              ✓ Accepter
                            </button>
                            <button (click)="rejectProposal(clause, p)" [disabled]="processing() === p.id"
                              class="px-2 py-1 text-[11px] font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded transition-colors disabled:opacity-50">
                              ✕ Refuser
                            </button>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        } @else {
          <p class="text-sm text-gray-400 text-center py-10">
            Aucune clause extraite du document source. Lance d'abord l'extraction depuis la page document.
          </p>
        }
      </div>
    </div>

    <!-- Pane droit : chat focus sur la clause active -->
    <div class="w-96 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-100 shrink-0">
        <h3 class="text-sm font-semibold text-gray-800">Composer</h3>
        @if (focusedClauseLabel()) {
          <p class="text-[11px] text-gray-500 mt-0.5">Édition de : <span class="font-medium text-gray-700">{{ focusedClauseLabel() }}</span></p>
        } @else {
          <p class="text-[11px] text-gray-500 mt-0.5">Clique une clause pour l'éditer</p>
        }
      </div>

      <div class="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        @if (!state()?.history?.length) {
          <div class="text-center py-6 text-xs text-gray-400">
            <p class="mb-3">Pose une instruction sur la clause sélectionnée :</p>
            <div class="space-y-1.5 text-left">
              @for (ex of examples; track ex) {
                <button (click)="instruction.set(ex); send()" [disabled]="!focusedClauseId()"
                  class="block w-full text-xs px-3 py-2 rounded-md bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors disabled:opacity-50">
                  {{ ex }}
                </button>
              }
            </div>
          </div>
        }
        @for (h of state()?.history ?? []; track h.id) {
          <div [class]="h.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
            <div [class]="h.role === 'user'
              ? 'bg-gray-900 text-white rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%]'
              : 'bg-gray-100 text-gray-800 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%]'"
              class="text-xs leading-relaxed">
              {{ h.content }}
              @if (h.clauseId) {
                <span class="text-[10px] opacity-70 block mt-0.5">— sur {{ clauseLabel(h.clauseId) }}</span>
              }
            </div>
          </div>
        }
        @if (sending()) {
          <div class="flex justify-start">
            <div class="bg-gray-100 text-gray-500 rounded-2xl px-3 py-2 text-xs italic">Édition en cours…</div>
          </div>
        }
      </div>

      <div class="p-3 border-t border-gray-100 shrink-0">
        @if (!focusedClauseId()) {
          <p class="text-[11px] text-amber-600 text-center mb-2">Sélectionne une clause à gauche pour l'éditer.</p>
        }
        <div class="flex gap-2">
          <textarea [ngModel]="instruction()" (ngModelChange)="instruction.set($event)"
            (keydown.enter)="$event.preventDefault(); send()" rows="2"
            placeholder="Ex : Plafonne la responsabilité à 12 mois de redevance"
            [disabled]="!focusedClauseId()"
            class="flex-1 text-xs px-2.5 py-2 rounded-md border border-gray-300 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 resize-none disabled:bg-gray-50 disabled:opacity-60"></textarea>
          <button (click)="send()" [disabled]="!focusedClauseId() || !instruction().trim() || sending()"
            class="btn-primary self-end disabled:opacity-50">
            Envoyer
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ContractComposerViewComponent implements OnInit {
  @Input({ required: true }) anaId = '';
  @Output() reload = new EventEmitter<void>();

  private svc = inject(AnalysisService);
  private refSvc = inject(ReferenceBaseService);
  private sanitizer = inject(DomSanitizer);

  loading = signal(true);
  state = signal<ComposerState | null>(null);
  standards = signal<ReferenceAsset[]>([]);
  focusedClauseId = signal<string | null>(null);
  instruction = signal('');
  sending = signal(false);
  processing = signal<string | null>(null);

  readonly examples = [
    'Rends cette clause plus stricte',
    'Plafonne la responsabilité à 12 mois',
    'Ajoute une carve-out pour faute lourde',
    'Aligne sur le standard de référence',
  ];

  ngOnInit() {
    this.refSvc.list().subscribe(list => this.standards.set(list.filter(a => a.type === 'standard')));
    this.load();
  }

  load() {
    this.loading.set(true);
    this.svc.getContractComposer(this.anaId).subscribe({
      next: ({ state }) => {
        this.state.set(state);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  setFocus(clauseId: string) {
    this.focusedClauseId.set(clauseId);
  }

  setStandard(standardId: string | null) {
    this.state.update(s => s ? { ...s, standardId } : s);
  }

  focusedClauseLabel = computed(() => {
    const id = this.focusedClauseId();
    if (!id) return null;
    const c = this.state()?.clauses.find(x => x.id === id);
    return c ? (c.heading || c.type) : null;
  });

  totalPendingProposals(): number {
    return (this.state()?.clauses ?? []).reduce((s, c) => s + c.pendingProposals.length, 0);
  }

  clauseLabel(id: string): string {
    const c = this.state()?.clauses.find(x => x.id === id);
    return c ? (c.heading || c.type) : id;
  }

  severityClass(s: string) {
    return {
      critical: 'bg-red-100 text-red-700',
      major: 'bg-amber-100 text-amber-700',
      minor: 'bg-gray-100 text-gray-600',
      info: 'bg-blue-50 text-blue-700',
    }[s] ?? 'bg-gray-100 text-gray-600';
  }

  // Rend le texte de la clause avec les proposals pending appliquées en track-changes
  renderClauseHtml(clause: ComposerClause): SafeHtml {
    let html = this.escape(clause.workingText);
    // Pour chaque pending proposal, marque visuellement dans le texte
    for (const p of clause.pendingProposals) {
      if (p.action === 'replace' && p.originalText) {
        const orig = this.escape(p.originalText);
        const proposed = this.escape(p.proposedText);
        html = html.replace(orig, `<span class="del" title="${this.escape(p.rationale)}">${orig}</span><span class="ins" title="${this.escape(p.rationale)}">${proposed}</span>`);
      } else if (p.action === 'delete' && p.originalText) {
        const orig = this.escape(p.originalText);
        html = html.replace(orig, `<span class="del" title="${this.escape(p.rationale)}">${orig}</span>`);
      } else if (p.action === 'insert' && p.proposedText) {
        // Ajoute en fin (pas idéal mais simple)
        html = `${html}<br><span class="ins" title="${this.escape(p.rationale)}">${this.escape(p.proposedText)}</span>`;
      }
    }
    // Préserver les sauts de ligne
    html = html.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    return this.sanitizer.bypassSecurityTrustHtml(`<p>${html}</p>`);
  }

  private escape(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  send() {
    const id = this.focusedClauseId();
    const instr = this.instruction().trim();
    if (!id || !instr || this.sending()) return;
    this.sending.set(true);
    const standardId = this.state()?.standardId;
    this.svc.editComposerClause(this.anaId, id, instr, standardId).subscribe({
      next: ({ clause }) => {
        // Update state with the returned clause
        this.state.update(s => s ? {
          ...s,
          clauses: s.clauses.map(c => c.id === clause.id ? clause : c),
          history: [...s.history, {
            id: 'tmp_u_' + Date.now(),
            ts: new Date().toISOString(),
            role: 'user',
            content: instr,
            clauseId: id,
          }, {
            id: 'tmp_s_' + Date.now(),
            ts: new Date().toISOString(),
            role: 'system',
            content: clause.pendingProposals.length > 0
              ? `${clause.pendingProposals.length} proposition(s) ajoutée(s).`
              : 'Aucune proposition générée.',
            clauseId: id,
          }],
        } : s);
        this.instruction.set('');
        this.sending.set(false);
      },
      error: () => this.sending.set(false),
    });
  }

  acceptProposal(clause: ComposerClause, p: ComposerProposal) {
    this.processing.set(p.id);
    this.svc.acceptComposerProposal(this.anaId, p.id, clause.id).subscribe({
      next: ({ clause: updated }) => {
        this.state.update(s => s ? { ...s, clauses: s.clauses.map(c => c.id === updated.id ? updated : c) } : s);
        this.processing.set(null);
      },
      error: () => this.processing.set(null),
    });
  }

  rejectProposal(clause: ComposerClause, p: ComposerProposal) {
    this.processing.set(p.id);
    this.svc.rejectComposerProposal(this.anaId, p.id, clause.id).subscribe({
      next: ({ clause: updated }) => {
        this.state.update(s => s ? { ...s, clauses: s.clauses.map(c => c.id === updated.id ? updated : c) } : s);
        this.processing.set(null);
      },
      error: () => this.processing.set(null),
    });
  }

  reset() {
    if (!confirm('Repartir du document source ? Toutes les modifications seront perdues.')) return;
    this.svc.resetContractComposer(this.anaId).subscribe(() => this.load());
  }
}
