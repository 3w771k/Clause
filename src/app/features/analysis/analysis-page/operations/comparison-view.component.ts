import { Component, EventEmitter, Input, Output, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { ComparativeNoteComponent } from '../../deliverables/comparative-note/comparative-note.component';
import { AppTabsComponent, TabDef } from '../../../shared/app-tabs.component';
import { AnalysisService } from '../../../../core/services/analysis.service';
import type { Deliverable, ComparativeNoteContent, RedlineContent, ClauseSection } from '../../../../core/models/deliverable.model';

@Component({
  selector: 'app-comparison-view',
  standalone: true,
  imports: [AppTabsComponent, ComparativeNoteComponent, FormsModule, NgTemplateOutlet],
  host: { class: 'flex-1 flex flex-col overflow-hidden min-h-0 min-w-0' },
  template: `
    <app-tabs [tabs]="tabs" [activeId]="activeTab()" (tabChange)="activeTab.set($any($event))" />

    <div class="flex-1 overflow-y-auto min-h-0">

      <!-- ─── Note comparative ─────────────────────────────────────────── -->
      @if (activeTab() === 'note') {
        <div class="p-5">
          <div class="max-w-4xl mx-auto">
            @if (noteDeliverable(); as nd) {
              <div class="flex items-center justify-between mb-4">
                <div class="text-sm font-medium text-gray-700">{{ nd.name }}</div>
                <button (click)="refine.emit(nd.id)" class="btn-secondary">Affiner</button>
              </div>
              <app-comparative-note [content]="asNote(nd)" />
            } @else if (isGenerating) {
              <ng-container *ngTemplateOutlet="spinner; context: { label: 'Analyse comparative en cours…' }" />
            } @else {
              <p class="text-sm text-gray-400 text-center py-10">Note comparative non disponible.</p>
            }
          </div>
        </div>
      }

      <!-- ─── Redline par clause ───────────────────────────────────────── -->
      @if (activeTab() === 'redline') {
        <div class="p-5">
          <div class="max-w-3xl mx-auto">

            @if (clauseSections().length > 0) {
              <!-- Legend -->
              <div class="flex items-center justify-between mb-3">
                <p class="text-xs text-gray-500">{{ clauseSections().length }} clause(s) avec écart</p>
                <div class="flex items-center gap-3 text-xs text-gray-400">
                  <span><del class="rdl-del rdl-minor" style="text-decoration:line-through;background:#fee2e2;color:#b91c1c;padding:0 2px">suppr.</del></span>
                  <span><ins class="rdl-ins rdl-minor" style="text-decoration:underline;background:#dcfce7;color:#15803d;padding:0 2px">ajout</ins></span>
                </div>
              </div>

              <div class="space-y-3">
                @for (section of clauseSections(); track section.clauseType) {
                  <div class="bg-white border rounded-xl overflow-hidden"
                       [class]="editingClause() === section.clauseType ? 'border-indigo-300 ring-1 ring-indigo-200' :
                                promptingClause() === section.clauseType ? 'border-violet-300 ring-1 ring-violet-200' :
                                'border-gray-200'">

                    <!-- Card header -->
                    <div class="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                      <span class="text-xs font-bold text-gray-700 uppercase tracking-wide">{{ section.clauseType }}</span>
                      @if (section.severity) {
                        <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide" [class]="severityClass(section.severity)">
                          {{ section.severity }}
                        </span>
                      }
                      @if (section.gap === 'missing') {
                        <span class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Manquant</span>
                      }
                      <div class="flex-1"></div>
                      <!-- Override indicator -->
                      @if (overrides()[section.clauseType]) {
                        <span class="text-[10px] text-indigo-500 font-medium">✓ Modifié</span>
                      }
                    </div>

                    <!-- ── EDIT MODE ── -->
                    @if (editingClause() === section.clauseType) {
                      <div class="p-4 space-y-3">
                        <!-- Original text (read-only) -->
                        <div>
                          <p class="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Texte original</p>
                          <p class="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 leading-relaxed">{{ section.textA || '(absent)' }}</p>
                        </div>
                        <!-- Editable proposed text -->
                        <div>
                          <p class="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Texte proposé <span class="text-gray-300 normal-case tracking-normal font-normal">(modifiable)</span></p>
                          <textarea
                            class="w-full text-sm border border-gray-200 rounded-lg p-3 leading-relaxed resize-y min-h-24 focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300"
                            [ngModel]="editText()"
                            (ngModelChange)="editText.set($event)"
                            placeholder="Saisissez le texte proposé…"
                          ></textarea>
                        </div>
                        <!-- Live diff preview -->
                        @if (editText() && section.textA) {
                          <div>
                            <p class="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Aperçu redline</p>
                            <div class="text-sm leading-relaxed bg-white border border-gray-100 rounded-lg p-3"
                                 [innerHTML]="liveEditDiff(section)"></div>
                          </div>
                        }
                        <!-- Actions -->
                        <div class="flex justify-end gap-2 pt-1">
                          <button (click)="cancelEdit()" class="btn-secondary">Annuler</button>
                          <button (click)="applyEdit(section)" class="btn-primary">Appliquer</button>
                        </div>
                      </div>

                    <!-- ── PROMPT MODE ── -->
                    } @else if (promptingClause() === section.clauseType) {
                      <div class="p-4 space-y-3">
                        <!-- Show current diff -->
                        <div class="text-sm leading-relaxed" [innerHTML]="displayDiff(section)"></div>
                        <!-- Prompt input -->
                        <div class="border border-violet-200 bg-violet-50/50 rounded-lg p-3 space-y-2">
                          <p class="text-xs font-medium text-violet-700">💬 Instruction pour l'IA</p>
                          <input
                            type="text"
                            class="w-full text-sm border border-violet-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-violet-300"
                            [ngModel]="promptText()"
                            (ngModelChange)="promptText.set($event)"
                            (keydown.enter)="submitPrompt(section)"
                            placeholder="Ex : Aligner sur 36 mois avec reconduction tacite de 12 mois…"
                          />
                          <div class="flex justify-end gap-2">
                            <button (click)="cancelPrompt()" class="btn-secondary">Annuler</button>
                            <button (click)="submitPrompt(section)"
                                    [disabled]="generating() || !promptText().trim()"
                                    class="btn-primary disabled:opacity-50">
                              @if (generating()) {
                                <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
                                </svg>
                                Génération…
                              } @else {
                                Générer ↗
                              }
                            </button>
                          </div>
                        </div>
                      </div>

                    <!-- ── NORMAL VIEW ── -->
                    } @else {
                      <div class="p-4 space-y-2">
                        <!-- Diff text -->
                        <div class="text-sm leading-relaxed text-gray-800" [innerHTML]="displayDiff(section)"></div>
                        <!-- Recommendation -->
                        @if (section.recommendation) {
                          <p class="text-xs text-gray-400 italic border-l-2 border-gray-200 pl-2">→ {{ section.recommendation }}</p>
                        }
                        <!-- Action buttons -->
                        <div class="flex gap-2 pt-1">
                          <button (click)="startEdit(section)"
                                  class="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md text-gray-600 hover:bg-gray-100 transition-colors border border-gray-200">
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/>
                            </svg>
                            Éditer
                          </button>
                          <button (click)="startPrompt(section)"
                                  class="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md text-violet-600 hover:bg-violet-50 transition-colors border border-violet-200">
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
                            </svg>
                            Modifier via IA
                          </button>
                        </div>
                      </div>
                    }

                  </div>
                }
              </div>

            } @else if (isGenerating) {
              <ng-container *ngTemplateOutlet="spinner; context: { label: 'Calcul du redline en cours…' }" />
            } @else {
              <p class="text-sm text-gray-400 text-center py-10">Aucune divergence détectée.</p>
            }
          </div>
        </div>
      }

      <!-- ─── Document complet ─────────────────────────────────────────── -->
      @if (activeTab() === 'document') {
        @if (redlineDeliverable(); as rd) {
          <div class="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-2.5 flex items-center gap-3">
            <span class="text-xs text-gray-500">{{ changeCount() }} modification(s)</span>
            <div class="flex-1"></div>
            <a [href]="'/api/deliverables/' + rd.id + '/export/docx'" target="_blank"
               class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
              </svg>
              Exporter Word (track changes)
            </a>
          </div>
          <div class="py-8 px-4 bg-gray-100 min-h-full">
            <div class="max-w-3xl mx-auto bg-white shadow-sm border border-gray-200 rounded-sm px-14 py-12">
              <div class="text-sm leading-relaxed rdl-document-content"
                   [innerHTML]="documentHtml(rd)"></div>
            </div>
          </div>
        } @else if (isGenerating) {
          <ng-container *ngTemplateOutlet="spinner; context: { label: 'Génération du document en cours…' }" />
        } @else {
          <p class="text-sm text-gray-400 text-center py-10">Document non disponible.</p>
        }
      }

    </div>

    <!-- Shared spinner template -->
    <ng-template #spinner let-label="label">
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <svg class="w-8 h-8 text-gray-400 animate-spin mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
        </svg>
        <p class="text-sm font-medium text-gray-700">{{ label }}</p>
      </div>
    </ng-template>
  `,
})
export class ComparisonViewComponent {
  @Input({ required: true }) deliverables: Deliverable[] = [];
  @Input() isGenerating = false;
  @Input() anaId = '';
  @Output() deliverableUpdated = new EventEmitter<string>();
  @Output() refine = new EventEmitter<string>();

  private sanitizer = inject(DomSanitizer);
  private anaService = inject(AnalysisService);

  activeTab = signal<'note' | 'redline' | 'document'>('note');

  // Edit state
  editingClause = signal<string | null>(null);
  editText = signal('');

  // Prompt state
  promptingClause = signal<string | null>(null);
  promptText = signal('');
  generating = signal(false);

  // User overrides: clauseType → { diffHtml, text }
  overrides = signal<Record<string, { diffHtml: string; text: string }>>({});

  tabs: TabDef[] = [
    { id: 'note', label: 'Note comparative' },
    { id: 'redline', label: 'Redline par clause' },
    { id: 'document', label: 'Document complet' },
  ];

  noteDeliverable() { return this.deliverables.find(d => d.type === 'comparative_note') ?? null; }
  redlineDeliverable() { return this.deliverables.find(d => d.type === 'redline') ?? null; }
  asNote(d: Deliverable) { return d.content as ComparativeNoteContent; }

  clauseSections(): ClauseSection[] {
    return (this.redlineDeliverable()?.content as RedlineContent | null)?.clauseSections ?? [];
  }

  changeCount() {
    return (this.redlineDeliverable()?.content as RedlineContent | null)?.changes?.length ?? 0;
  }

  // ─── Edit actions ───────────────────────────────────────────────────────────

  startEdit(section: ClauseSection) {
    this.promptingClause.set(null);
    const override = this.overrides()[section.clauseType];
    this.editText.set(override?.text ?? section.textB ?? '');
    this.editingClause.set(section.clauseType);
  }

  cancelEdit() {
    this.editingClause.set(null);
    this.editText.set('');
  }

  applyEdit(section: ClauseSection) {
    const proposed = this.editText().trim();
    if (!proposed) return;
    const diffHtml = this.wordDiff(section.textA ?? '', proposed);
    this.overrides.update(map => ({ ...map, [section.clauseType]: { diffHtml, text: proposed } }));
    this.cancelEdit();
  }

  // ─── Prompt actions ─────────────────────────────────────────────────────────

  startPrompt(section: ClauseSection) {
    this.cancelEdit();
    this.promptText.set('');
    this.promptingClause.set(section.clauseType);
  }

  cancelPrompt() {
    this.promptingClause.set(null);
    this.promptText.set('');
  }

  submitPrompt(section: ClauseSection) {
    const prompt = this.promptText().trim();
    if (!prompt || !this.anaId) return;
    this.generating.set(true);
    this.anaService.refineClause(this.anaId, {
      clauseType: section.clauseType,
      textA: section.textA ?? '',
      textB: this.overrides()[section.clauseType]?.text ?? section.textB ?? '',
      userPrompt: prompt,
    }).subscribe({
      next: ({ proposedText }) => {
        this.generating.set(false);
        this.cancelPrompt();
        // Enter edit mode with AI result so user can review before applying
        this.editText.set(proposedText);
        this.editingClause.set(section.clauseType);
      },
      error: () => this.generating.set(false),
    });
  }

  // ─── Display helpers ────────────────────────────────────────────────────────

  displayDiff(section: ClauseSection): SafeHtml {
    const override = this.overrides()[section.clauseType];
    return this.trust(override?.diffHtml ?? section.diffHtml ?? '');
  }

  liveEditDiff(section: ClauseSection): SafeHtml {
    const proposed = this.editText();
    const textA = section.textA ?? '';
    if (!textA) return this.trust(proposed);
    return this.trust(this.wordDiff(textA, proposed));
  }

  documentHtml(rd: Deliverable): SafeHtml {
    return this.trust((rd.content as RedlineContent).baseHtml ?? '', true);
  }

  private trust(html: string, fullDoc = false): SafeHtml {
    const tags = fullDoc
      ? ['div', 'section', 'h3', 'p', 'hr', 'del', 'ins', 'em', 'strong', 'span', 'br']
      : ['del', 'ins', 'p', 'span', 'em', 'strong', 'br'];
    const clean = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: tags,
      ALLOWED_ATTR: ['class', 'data-type', 'data-gap', 'data-pid'],
    });
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }

  severityClass(sev: string): string {
    return ({ critical: 'bg-red-100 text-red-700', major: 'bg-orange-100 text-orange-700', minor: 'bg-yellow-100 text-yellow-700', info: 'bg-gray-100 text-gray-500' } as Record<string, string>)[sev] ?? 'bg-gray-100 text-gray-500';
  }

  // ─── Client-side word-level LCS diff ────────────────────────────────────────

  wordDiff(textA: string, textB: string): string {
    const tokenize = (s: string) => s.match(/\S+|\s+/g) ?? [];
    const A = tokenize(textA), B = tokenize(textB);
    const m = A.length, n = B.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = A[i-1] === B[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
    const ops: { type: 'eq'|'del'|'ins'; text: string }[] = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && A[i-1] === B[j-1]) { ops.unshift({ type: 'eq', text: A[i-1] }); i--; j--; }
      else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { ops.unshift({ type: 'ins', text: B[j-1] }); j--; }
      else { ops.unshift({ type: 'del', text: A[i-1] }); i--; }
    }
    const merged: typeof ops = [];
    for (const op of ops) {
      const last = merged[merged.length - 1];
      if (last?.type === op.type) last.text += op.text;
      else merged.push({ ...op });
    }
    return merged.map(op => {
      if (op.type === 'eq') return op.text;
      if (op.type === 'del') return `<del class="rdl-del">${op.text}</del>`;
      return `<ins class="rdl-ins">${op.text}</ins>`;
    }).join('');
  }
}
