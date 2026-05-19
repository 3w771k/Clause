import { Component, EventEmitter, Input, Output, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { ReviewNoteComponent } from '../../deliverables/review-note/review-note.component';
import { AppTabsComponent, TabDef } from '../../../shared/app-tabs.component';
import { AnalysisService } from '../../../../core/services/analysis.service';
import type { Deliverable, ReviewNoteContent, RedlineContent, ClauseSection } from '../../../../core/models/deliverable.model';

const ALLOWED_TAGS = ['p', 'div', 'span', 'section', 'h3', 'hr', 'del', 'ins', 'em', 'strong', 'br'];
const ALLOWED_ATTR = ['class', 'data-type', 'data-gap', 'data-pid'];

@Component({
  selector: 'app-audit-view',
  standalone: true,
  imports: [AppTabsComponent, ReviewNoteComponent, FormsModule, NgTemplateOutlet],
  host: { class: 'flex-1 flex flex-col overflow-hidden min-h-0 min-w-0' },
  template: `
    <app-tabs [tabs]="tabs" [activeId]="activeTab()" (tabChange)="activeTab.set($any($event))" />

    <div class="flex-1 overflow-y-auto min-h-0">

      <!-- ─── Note de revue ─────────────────────────────────────────────── -->
      @if (activeTab() === 'review') {
        <div class="p-5">
          <div class="max-w-4xl mx-auto">
            @if (reviewDeliverable(); as rev) {
              <div class="flex items-center justify-between mb-3">
                <div class="text-sm font-medium text-gray-700">{{ rev.name }}</div>
                <button (click)="refine.emit(rev.id)" class="btn-secondary">Affiner</button>
              </div>
              <app-review-note [content]="asReview(rev)" [deliverableId]="rev.id" />
            } @else if (isGenerating) {
              <ng-container *ngTemplateOutlet="spinner; context: { label: 'Audit en cours…', sub: 'Analyse du contrat vs playbook par le LLM (1–2 minutes).' }" />
            } @else {
              <p class="text-sm text-gray-400 text-center py-8">Note de revue non disponible.</p>
            }
          </div>
        </div>
      }

      <!-- ─── Redline par clause ─────────────────────────────────────────── -->
      @if (activeTab() === 'redline') {
        <div class="p-5">
          <div class="max-w-3xl mx-auto">

            @if (clauseSections().length > 0) {
              <div class="flex items-center justify-between mb-3">
                <p class="text-xs text-gray-500">{{ clauseSections().length }} clause(s) à réviser</p>
                <div class="flex items-center gap-3 text-xs text-gray-400">
                  <span><del class="rdl-del rdl-minor" style="text-decoration:line-through;background:#fee2e2;color:#b91c1c;padding:0 2px">contrat</del></span>
                  <span><ins class="rdl-ins rdl-minor" style="text-decoration:underline;background:#dcfce7;color:#15803d;padding:0 2px">playbook</ins></span>
                </div>
              </div>

              <div class="space-y-4">
                @for (section of clauseSections(); track section.clauseType) {
                  <div class="border rounded-lg overflow-hidden"
                       [class]="editingClause() === section.clauseType ? 'border-indigo-300 ring-1 ring-indigo-200' :
                                promptingClause() === section.clauseType ? 'border-violet-300 ring-1 ring-violet-200' :
                                section.severity === 'critical' ? 'border-red-200' :
                                section.severity === 'major' ? 'border-orange-200' : 'border-gray-200'">

                    <!-- Header clause -->
                    <div class="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-inherit">
                      <div class="flex items-center gap-2">
                        <span class="text-xs font-semibold text-gray-700 uppercase tracking-wide">{{ section.clauseType }}</span>
                        <span class="px-1.5 py-0.5 text-xs rounded font-medium"
                              [class]="section.severity === 'critical' ? 'bg-red-100 text-red-700' :
                                       section.severity === 'major' ? 'bg-orange-100 text-orange-700' :
                                       section.severity === 'minor' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'">
                          {{ section.gap }}
                        </span>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <button (click)="startEdit(section)" class="px-2 py-1 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors">
                          Modifier
                        </button>
                        <button (click)="startPrompt(section)" class="px-2 py-1 text-xs rounded border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 transition-colors">
                          ✦ Prompter
                        </button>
                      </div>
                    </div>

                    <!-- Mode édition -->
                    @if (editingClause() === section.clauseType) {
                      <div class="p-4 space-y-3 bg-indigo-50/30">
                        <div>
                          <label class="text-xs font-medium text-gray-500 mb-1 block">Texte proposé (modifiable)</label>
                          <textarea [(ngModel)]="editText"
                                    rows="5"
                                    class="w-full text-sm border border-indigo-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white resize-y font-mono"></textarea>
                        </div>
                        <div>
                          <label class="text-xs font-medium text-gray-500 mb-1 block">Aperçu diff live</label>
                          <div class="text-sm leading-relaxed p-3 bg-white border border-gray-200 rounded-md"
                               [innerHTML]="liveEditDiff(section)"></div>
                        </div>
                        <div class="flex gap-2">
                          <button (click)="applyEdit(section)" class="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Appliquer</button>
                          <button (click)="cancelEdit()" class="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-md hover:bg-gray-50 text-gray-600">Annuler</button>
                        </div>
                      </div>
                    }

                    <!-- Mode prompt IA -->
                    @else if (promptingClause() === section.clauseType) {
                      <div class="p-4 space-y-3 bg-violet-50/30">
                        <div class="flex gap-2">
                          <input type="text" [(ngModel)]="promptText"
                                 placeholder="Ex : Aligner sur le modèle de la clause 12 du playbook…"
                                 class="flex-1 text-sm border border-violet-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                                 (keydown.enter)="submitPrompt(section)" />
                          <button (click)="submitPrompt(section)" [disabled]="generating()"
                                  class="px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50">
                            @if (generating()) { … } @else { Envoyer }
                          </button>
                          <button (click)="cancelPrompt()" class="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-md hover:bg-gray-50 text-gray-600">✕</button>
                        </div>
                        @if (generating()) {
                          <p class="text-xs text-violet-600">Génération en cours…</p>
                        }
                      </div>
                    }

                    <!-- Diff affiché -->
                    @else {
                      <div class="p-4">
                        <div class="text-sm leading-relaxed" [innerHTML]="displayDiff(section)"></div>
                        @if (section.recommendation) {
                          <p class="mt-2 text-xs text-gray-500 italic border-t border-gray-100 pt-2">{{ section.recommendation }}</p>
                        }
                      </div>
                    }
                  </div>
                }
              </div>

            } @else if (isGenerating) {
              <ng-container *ngTemplateOutlet="spinner; context: { label: 'Génération du redline en cours…', sub: 'Arrive après la note de revue.' }" />
            } @else {
              <p class="text-sm text-gray-400 text-center py-10">Redline non disponible.</p>
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
    <ng-template #spinner let-label="label" let-sub="sub">
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <svg class="w-8 h-8 text-gray-400 animate-spin mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
        </svg>
        <p class="text-sm font-medium text-gray-700">{{ label }}</p>
        @if (sub) { <p class="text-xs text-gray-500 mt-1">{{ sub }}</p> }
      </div>
    </ng-template>
  `,
})
export class AuditViewComponent {
  @Input({ required: true }) deliverables: Deliverable[] = [];
  @Input() isGenerating = false;
  @Input() anaId = '';
  @Output() deliverableUpdated = new EventEmitter<string>();
  @Output() refine = new EventEmitter<string>();

  private sanitizer = inject(DomSanitizer);
  private anaService = inject(AnalysisService);

  activeTab = signal<'review' | 'redline' | 'document'>('review');

  tabs: TabDef[] = [
    { id: 'review', label: 'Note de revue' },
    { id: 'redline', label: 'Redline par clause' },
    { id: 'document', label: 'Document complet' },
  ];

  editingClause = signal<string | null>(null);
  editText = '';
  promptingClause = signal<string | null>(null);
  promptText = '';
  generating = signal(false);
  overrides = signal<Record<string, { diffHtml: string; text: string }>>({});

  reviewDeliverable() { return this.deliverables.find(d => d.type === 'review_note') ?? null; }
  redlineDeliverable() { return this.deliverables.find(d => d.type === 'redline') ?? null; }

  clauseSections = computed<ClauseSection[]>(() => {
    const rd = this.deliverables.find(d => d.type === 'redline');
    return (rd?.content as RedlineContent)?.clauseSections ?? [];
  });

  asReview(d: Deliverable) { return d.content as ReviewNoteContent; }

  changeCount() {
    return (this.redlineDeliverable()?.content as RedlineContent | null)?.changes?.length ?? 0;
  }

  documentHtml(rd: Deliverable): SafeHtml {
    const html = (rd.content as RedlineContent).baseHtml ?? '';
    const clean = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['div', 'section', 'h3', 'p', 'hr', 'del', 'ins', 'em', 'strong', 'span', 'br'],
      ALLOWED_ATTR: ['class', 'data-type', 'data-gap', 'data-pid'],
    });
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }

  // ─── Edit mode ───────────────────────────────────────────────────────────────

  startEdit(section: ClauseSection) {
    const override = this.overrides()[section.clauseType];
    this.editText = override?.text ?? section.textB ?? '';
    this.promptingClause.set(null);
    this.editingClause.set(section.clauseType);
  }

  cancelEdit() { this.editingClause.set(null); }

  applyEdit(section: ClauseSection) {
    const proposed = this.editText.trim();
    if (!proposed) return;
    this.overrides.update(o => ({
      ...o,
      [section.clauseType]: { diffHtml: this.wordDiff(section.textA ?? '', proposed), text: proposed },
    }));
    this.editingClause.set(null);
  }

  liveEditDiff(section: ClauseSection): SafeHtml {
    return this.safe(this.wordDiff(section.textA ?? '', this.editText));
  }

  // ─── Prompt mode ─────────────────────────────────────────────────────────────

  startPrompt(section: ClauseSection) {
    this.promptText = '';
    this.editingClause.set(null);
    this.promptingClause.set(section.clauseType);
  }

  cancelPrompt() { this.promptingClause.set(null); }

  submitPrompt(section: ClauseSection) {
    const prompt = this.promptText.trim();
    if (!prompt || !this.anaId) return;
    this.generating.set(true);
    this.anaService.refineClause(this.anaId, {
      clauseType: section.clauseType,
      textA: section.textA ?? '',
      textB: section.textB ?? '',
      userPrompt: prompt,
    }).subscribe({
      next: ({ proposedText }) => {
        this.generating.set(false);
        this.promptingClause.set(null);
        this.editText = proposedText;
        this.editingClause.set(section.clauseType);
      },
      error: () => this.generating.set(false),
    });
  }

  // ─── Display ─────────────────────────────────────────────────────────────────

  displayDiff(section: ClauseSection): SafeHtml {
    const override = this.overrides()[section.clauseType];
    if (override) return override.diffHtml as SafeHtml;
    return this.safe(section.diffHtml ?? '');
  }

  private safe(html: string): SafeHtml {
    const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }

  // ─── Word-level LCS diff (client-side) ───────────────────────────────────────

  private wordDiff(textA: string, textB: string): string {
    const tokenize = (s: string): string[] => s.match(/\S+|\s+/g) ?? [];
    const A = tokenize(textA), B = tokenize(textB);
    const m = A.length, n = B.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = A[i-1] === B[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
    const ops: Array<{ type: 'eq' | 'del' | 'ins'; text: string }> = [];
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
    const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return merged.map(op => {
      const t = esc(op.text);
      if (op.type === 'eq') return t;
      if (op.type === 'del') return `<del class="rdl-del rdl-major">${t}</del>`;
      return `<ins class="rdl-ins rdl-major">${t}</ins>`;
    }).join('');
  }
}
