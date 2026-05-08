import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { TabularAnalysis, CustomCheck } from '../../../../core/services/analysis.service';

@Component({
  selector: 'app-tabular-analysis-panel',
  standalone: true,
  imports: [FormsModule],
  host: { class: 'w-96 shrink-0 flex flex-col border-l border-gray-200 bg-white overflow-hidden' },
  template: `
    <div class="px-4 py-3 border-b border-gray-100 shrink-0 flex items-center justify-between">
      <div class="min-w-0">
        <span class="text-sm font-semibold text-gray-800">Analyse de cohérence</span>
        @if (analysis?.generatedAt) {
          <span class="text-[10px] text-gray-400 block">Mise à jour : {{ formatDate(analysis!.generatedAt) }}</span>
        }
      </div>
      <div class="flex items-center gap-2">
        <button (click)="rerun.emit()" [disabled]="loading"
          class="text-xs px-2 py-1 rounded text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
          title="Re-générer l'analyse">
          @if (loading) { … } @else { Re-générer }
        </button>
        <button (click)="close.emit()" class="text-gray-400 hover:text-gray-600">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-5 min-h-0">
      @if (!analysis && !loading) {
        <div class="text-center py-10">
          <p class="text-sm text-gray-500 mb-3">Aucune analyse pour le moment.</p>
          <button (click)="rerun.emit()" class="btn-primary">Analyser la cohérence</button>
        </div>
      }

      @if (loading) {
        <div class="text-center py-10 text-sm text-gray-500">
          Analyse en cours… (cela peut prendre 10-30 s)
        </div>
      }

      @if (analysis; as a) {
        <!-- Synthèse globale -->
        <section>
          <h4 class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Synthèse</h4>
          <p class="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg px-3 py-2">{{ a.globalSynthesis }}</p>
        </section>

        <!-- Custom checks results -->
        @if (a.customCheckResults?.length) {
          <section>
            <h4 class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Mes vérifications</h4>
            <div class="space-y-2">
              @for (cr of a.customCheckResults; track cr.checkId) {
                <div class="bg-white border border-gray-200 rounded-lg p-2.5">
                  <p class="text-[11px] text-gray-500 italic mb-1.5">« {{ cr.prompt }} »</p>
                  <p class="text-xs text-gray-700 mb-1.5">{{ cr.summary }}</p>
                  @if (cr.findings.length) {
                    <ul class="text-[11px] text-gray-600 space-y-0.5">
                      @for (f of cr.findings; track $index) {
                        <li>
                          @if (f.documentName) {
                            <span class="font-medium">{{ f.documentName }} :</span>
                          }
                          {{ f.finding }}
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="text-[11px] text-gray-400">Aucune anomalie.</p>
                  }
                </div>
              }
            </div>
          </section>
        }

        <!-- Verdicts par ligne (si playbook attaché) -->
        @if (a.rowVerdicts?.length) {
          <section>
            <h4 class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Verdicts par document</h4>
            <div class="space-y-1.5">
              @for (v of a.rowVerdicts; track v.rowId) {
                <button (click)="rowClick.emit(v.rowId)"
                  class="w-full text-left bg-white border border-gray-200 rounded-lg p-2.5 hover:border-gray-300 transition-colors">
                  <div class="flex items-center gap-2 mb-1">
                    <span [class]="verdictClass(v.verdict)"
                      class="text-[10px] font-semibold px-1.5 py-0.5 rounded">{{ verdictLabel(v.verdict) }}</span>
                    <span class="text-xs text-gray-700 truncate flex-1">{{ v.documentName }}</span>
                  </div>
                  <p class="text-xs text-gray-500">{{ v.rationale }}</p>
                  @if (v.brokenRules.length) {
                    <p class="text-[10px] text-gray-400 mt-1">Règles enfreintes : {{ v.brokenRules.join(', ') }}</p>
                  }
                </button>
              }
            </div>
          </section>
        }

        <!-- Outliers par colonne -->
        <section>
          <h4 class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
            Outliers par colonne
            @if (totalOutliers() === 0) {
              <span class="text-gray-300 normal-case ml-1">— aucun</span>
            }
          </h4>
          <div class="space-y-3">
            @for (col of a.columnAnalyses; track col.columnId) {
              @if (col.outliers.length || col.synthesis) {
                <div class="border-l-2 border-gray-200 pl-3">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-medium text-gray-800">{{ col.columnLabel }}</span>
                    @if (col.outliers.length) {
                      <span class="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700">{{ col.outliers.length }} outlier{{ col.outliers.length > 1 ? 's' : '' }}</span>
                    }
                  </div>
                  @if (col.synthesis) {
                    <p class="text-[11px] text-gray-500 mb-1.5">{{ col.synthesis }}</p>
                  }
                  @for (o of col.outliers; track o.rowId) {
                    <button (click)="cellClick.emit({ rowId: o.rowId, columnId: col.columnId })"
                      class="w-full text-left text-xs bg-red-50/50 border border-red-100 rounded px-2 py-1.5 mb-1 hover:bg-red-50 transition-colors">
                      <div class="flex items-center gap-1.5 mb-0.5">
                        <span class="text-gray-700 font-medium truncate">{{ o.documentName }}</span>
                      </div>
                      <p class="text-gray-600 italic mb-0.5">"{{ o.value || '(vide)' }}"</p>
                      <p class="text-gray-500">{{ o.reason }}</p>
                    </button>
                  }
                </div>
              }
            }
          </div>
        </section>

        <!-- Mes règles (custom checks management) -->
        <section>
          <h4 class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Mes règles à vérifier</h4>
          <div class="space-y-1.5 mb-2">
            @for (chk of customChecks; track chk.id) {
              <div class="flex items-start gap-1.5 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5">
                <span class="text-xs text-gray-700 flex-1">{{ chk.prompt }}</span>
                <button (click)="removeCheck.emit(chk.id)" class="text-gray-400 hover:text-red-500 shrink-0" title="Supprimer">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            }
            @if (customChecks.length === 0) {
              <p class="text-[11px] text-gray-400 italic">Ajoutez vos propres règles, elles seront évaluées au prochain "Re-générer".</p>
            }
          </div>
          <div class="flex gap-2">
            <textarea [ngModel]="newCheck()" (ngModelChange)="newCheck.set($event)" rows="2"
              placeholder="Ex : Tous les contrats doivent être sous loi française."
              class="flex-1 text-xs px-2 py-1.5 rounded-md border border-gray-300 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 resize-none"></textarea>
            <button (click)="submitCheck()" [disabled]="!newCheck().trim()"
              class="btn-secondary self-end">Ajouter</button>
          </div>
        </section>

        <!-- Règles déclarées du workflow -->
        @if (a.declaredRulesResults?.length) {
          <section>
            <h4 class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Règles du workflow</h4>
            <div class="space-y-2">
              @for (r of a.declaredRulesResults; track r.ruleId) {
                <div class="bg-white border border-gray-200 rounded-lg p-2.5">
                  <p class="text-xs font-medium text-gray-800 mb-1">{{ r.ruleLabel }}</p>
                  @if (r.findings.length) {
                    <ul class="text-[11px] text-gray-600 space-y-0.5">
                      @for (f of r.findings; track f) {
                        <li>• {{ f }}</li>
                      }
                    </ul>
                  } @else {
                    <p class="text-[11px] text-gray-400">Aucune anomalie détectée.</p>
                  }
                </div>
              }
            </div>
          </section>
        }
      }
    </div>
  `,
})
export class TabularAnalysisPanelComponent {
  @Input() analysis: TabularAnalysis | null = null;
  @Input() loading = false;
  @Input() customChecks: CustomCheck[] = [];
  @Output() rerun = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
  @Output() cellClick = new EventEmitter<{ rowId: string; columnId: string }>();
  @Output() rowClick = new EventEmitter<string>();
  @Output() addCheck = new EventEmitter<string>();
  @Output() removeCheck = new EventEmitter<string>();

  newCheck = signal('');

  submitCheck() {
    const v = this.newCheck().trim();
    if (!v) return;
    this.addCheck.emit(v);
    this.newCheck.set('');
  }

  totalOutliers(): number {
    return this.analysis?.columnAnalyses.reduce((s, c) => s + c.outliers.length, 0) ?? 0;
  }

  verdictClass(v: 'compliant' | 'attention' | 'risk') {
    return {
      compliant: 'bg-emerald-50 text-emerald-700',
      attention: 'bg-amber-50 text-amber-700',
      risk: 'bg-red-50 text-red-700',
    }[v];
  }

  verdictLabel(v: 'compliant' | 'attention' | 'risk') {
    return { compliant: '✓ Conforme', attention: '! Attention', risk: '⚠ Risque' }[v];
  }

  formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }
}
