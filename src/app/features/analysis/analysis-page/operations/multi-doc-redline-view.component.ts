import { Component, EventEmitter, Input, Output, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { ApiService } from '../../../../core/services/api.service';
import { AnalysisService } from '../../../../core/services/analysis.service';
import type { Analysis } from '../../../../core/models/analysis.model';
import type { Deliverable, RedlineContent, ClauseSection } from '../../../../core/models/deliverable.model';

const ALLOWED_TAGS = ['p', 'div', 'span', 'section', 'h3', 'hr', 'del', 'ins', 'em', 'strong', 'br'];
const ALLOWED_ATTR = ['class', 'data-type', 'data-gap', 'data-pid'];

interface DocEntry {
  docId: string;
  docName: string;
  legalObjectId: string | null;
  redline: Deliverable | null;
}

@Component({
  selector: 'app-multi-doc-redline-view',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet],
  host: { class: 'flex-1 flex flex-col overflow-hidden min-h-0 min-w-0' },
  template: `
    <!-- Toolbar -->
    <div class="px-5 py-3 border-b border-gray-200 bg-white shrink-0 flex items-center gap-3">
      <button (click)="generateAll()" [disabled]="!canGenerate() || generating()" class="btn-primary">
        @if (generating()) { Génération… } @else { Tout générer }
      </button>
      @if (lastError()) { <span class="text-xs text-red-600">{{ lastError() }}</span> }
      @if (docEntries().length > 0 && generatedCount() > 0) {
        <span class="text-xs text-gray-500">{{ generatedCount() }}/{{ docEntries().length }} généré(s)</span>
      }
    </div>

    <div class="flex-1 overflow-y-auto p-5 min-h-0">
      <div class="max-w-3xl mx-auto">

        @if (!docEntries().length) {
          <p class="text-sm text-gray-400 text-center py-8">Aucun document cible dans cette analyse.</p>
        } @else {
          <div class="space-y-3">
            @for (entry of docEntries(); track entry.docId) {
              <div class="border border-gray-200 rounded-lg overflow-hidden">

                <!-- Accordéon header -->
                <div class="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer select-none"
                     (click)="toggleDoc(entry.docId)">
                  <div class="flex items-center gap-2">
                    <svg class="w-4 h-4 text-gray-400 transition-transform duration-150"
                         [class.rotate-90]="expandedDoc() === entry.docId"
                         fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                    </svg>
                    <span class="text-sm font-medium text-gray-800">{{ entry.docName }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    @if (entry.redline) {
                      <span class="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-medium">
                        {{ clauseSectionsFor(entry).length }} clause(s)
                      </span>
                    } @else {
                      <span class="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">En attente</span>
                    }
                    <button (click)="$event.stopPropagation(); generateOne(entry)"
                            [disabled]="generating()"
                            class="px-2 py-1 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors">
                      Régénérer
                    </button>
                  </div>
                </div>

                <!-- Contenu accordéon -->
                @if (expandedDoc() === entry.docId && entry.redline) {
                  <div class="p-4">
                    @if (clauseSectionsFor(entry).length === 0) {
                      <p class="text-sm text-gray-400 text-center py-4">Aucune divergence détectée.</p>
                    } @else {
                      <div class="space-y-3">
                        @for (section of clauseSectionsFor(entry); track section.clauseType) {
                          <div class="border rounded-md overflow-hidden"
                               [class]="editKey() === editKeyFor(entry, section) ? 'border-indigo-300 ring-1 ring-indigo-200' :
                                        promptKey() === editKeyFor(entry, section) ? 'border-violet-300 ring-1 ring-violet-200' :
                                        section.severity === 'critical' ? 'border-red-200' :
                                        section.severity === 'major' ? 'border-orange-200' : 'border-gray-200'">

                            <!-- Header clause -->
                            <div class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-inherit">
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
                                <button (click)="startEdit(entry, section)" class="px-2 py-1 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors">Modifier</button>
                                <button (click)="startPrompt(entry, section)" class="px-2 py-1 text-xs rounded border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 transition-colors">✦ Prompter</button>
                              </div>
                            </div>

                            <!-- Mode édition -->
                            @if (editKey() === editKeyFor(entry, section)) {
                              <div class="p-3 space-y-3 bg-indigo-50/30">
                                <textarea [(ngModel)]="editText" rows="4"
                                          class="w-full text-sm border border-indigo-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white resize-y font-mono"></textarea>
                                <div class="text-sm leading-relaxed p-3 bg-white border border-gray-200 rounded-md"
                                     [innerHTML]="liveEditDiff(section)"></div>
                                <div class="flex gap-2">
                                  <button (click)="applyEdit(entry, section)" class="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Appliquer</button>
                                  <button (click)="cancelEdit()" class="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-md hover:bg-gray-50 text-gray-600">Annuler</button>
                                </div>
                              </div>
                            }

                            <!-- Mode prompt IA -->
                            @else if (promptKey() === editKeyFor(entry, section)) {
                              <div class="p-3 space-y-2 bg-violet-50/30">
                                <div class="flex gap-2">
                                  <input type="text" [(ngModel)]="promptText"
                                         placeholder="Instruction pour l'IA…"
                                         class="flex-1 text-sm border border-violet-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                                         (keydown.enter)="submitPrompt(entry, section)" />
                                  <button (click)="submitPrompt(entry, section)" [disabled]="generating()"
                                          class="px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50">
                                    @if (generating()) { … } @else { Envoyer }
                                  </button>
                                  <button (click)="cancelPrompt()" class="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-md hover:bg-gray-50 text-gray-600">✕</button>
                                </div>
                                @if (generating()) { <p class="text-xs text-violet-600">Génération en cours…</p> }
                              </div>
                            }

                            <!-- Diff affiché -->
                            @else {
                              <div class="p-3">
                                <div class="text-sm leading-relaxed" [innerHTML]="displayDiff(entry, section)"></div>
                                @if (section.recommendation) {
                                  <p class="mt-2 text-xs text-gray-500 italic border-t border-gray-100 pt-2">{{ section.recommendation }}</p>
                                }
                              </div>
                            }
                          </div>
                        }
                      </div>
                    }
                  </div>
                }

                @if (expandedDoc() === entry.docId && !entry.redline) {
                  <div class="p-4">
                    <p class="text-sm text-gray-400 text-center py-4">Redline non encore généré pour ce document.</p>
                  </div>
                }

              </div>
            }
          </div>
        }

      </div>
    </div>
  `,
})
export class MultiDocRedlineViewComponent {
  @Input() analysis: Analysis | null = null;
  @Input() deliverables: Deliverable[] = [];
  @Input() anaId = '';
  @Output() reload = new EventEmitter<void>();

  private api = inject(ApiService);
  private anaService = inject(AnalysisService);
  private sanitizer = inject(DomSanitizer);

  generating = signal(false);
  lastError = signal('');
  expandedDoc = signal<string | null>(null);
  editKey = signal<string | null>(null);
  editText = '';
  promptKey = signal<string | null>(null);
  promptText = '';
  overrides = signal<Record<string, { diffHtml: string; text: string }>>({});

  canGenerate() { return !!this.analysis?.documents?.length; }

  docEntries = computed<DocEntry[]>(() => {
    const docs = this.analysis?.documents ?? [];
    return docs.map(doc => ({
      docId: doc.id,
      docName: doc.documentName ?? doc.id,
      legalObjectId: doc.legalObjectId,
      redline: this.deliverables.find(d =>
        d.type === 'redline' &&
        (d.sourceOperation === 'multi_doc_redline') &&
        (d.sourceDocumentIds ?? []).includes(doc.legalObjectId ?? doc.id)
      ) ?? null,
    }));
  });

  generatedCount = computed(() => this.docEntries().filter(e => e.redline).length);

  clauseSectionsFor(entry: DocEntry): ClauseSection[] {
    return (entry.redline?.content as RedlineContent)?.clauseSections ?? [];
  }

  editKeyFor(entry: DocEntry, section: ClauseSection) {
    return `${entry.docId}::${section.clauseType}`;
  }

  toggleDoc(docId: string) {
    this.expandedDoc.update(v => v === docId ? null : docId);
    this.cancelEdit();
    this.cancelPrompt();
  }

  // ─── Génération ──────────────────────────────────────────────────────────────

  generateAll() {
    if (!this.analysis) return;
    this.generating.set(true);
    this.lastError.set('');
    const ids = (this.analysis.documents ?? []).map(d => d.legalObjectId);
    this.api.http.post(
      `${this.api.base}/analyses/${this.analysis.id}/multi-doc-redline`,
      { sourceRedlineId: null, targetLegalObjectIds: ids },
    ).subscribe({
      next: () => { this.generating.set(false); this.reload.emit(); },
      error: (err) => { this.generating.set(false); this.lastError.set(err?.error?.error ?? 'Erreur'); },
    });
  }

  generateOne(entry: DocEntry) {
    if (!this.analysis || !entry.legalObjectId) return;
    this.api.http.post(
      `${this.api.base}/analyses/${this.analysis.id}/multi-doc-redline`,
      { sourceRedlineId: null, targetLegalObjectIds: [entry.legalObjectId] },
    ).subscribe({
      next: () => this.reload.emit(),
      error: (err) => this.lastError.set(err?.error?.error ?? 'Erreur'),
    });
  }

  // ─── Edit mode ───────────────────────────────────────────────────────────────

  startEdit(entry: DocEntry, section: ClauseSection) {
    const key = this.editKeyFor(entry, section);
    const override = this.overrides()[key];
    this.editText = override?.text ?? section.textB ?? '';
    this.promptKey.set(null);
    this.editKey.set(key);
  }

  cancelEdit() { this.editKey.set(null); }

  applyEdit(entry: DocEntry, section: ClauseSection) {
    const proposed = this.editText.trim();
    if (!proposed) return;
    const key = this.editKeyFor(entry, section);
    this.overrides.update(o => ({
      ...o,
      [key]: { diffHtml: this.wordDiff(section.textA ?? '', proposed), text: proposed },
    }));
    this.editKey.set(null);
  }

  liveEditDiff(section: ClauseSection): SafeHtml {
    return this.safe(this.wordDiff(section.textA ?? '', this.editText));
  }

  // ─── Prompt mode ─────────────────────────────────────────────────────────────

  startPrompt(entry: DocEntry, section: ClauseSection) {
    this.promptText = '';
    this.editKey.set(null);
    this.promptKey.set(this.editKeyFor(entry, section));
  }

  cancelPrompt() { this.promptKey.set(null); }

  submitPrompt(entry: DocEntry, section: ClauseSection) {
    const prompt = this.promptText.trim();
    const aid = this.anaId || this.analysis?.id || '';
    if (!prompt || !aid) return;
    this.generating.set(true);
    this.anaService.refineClause(aid, {
      clauseType: section.clauseType,
      textA: section.textA ?? '',
      textB: section.textB ?? '',
      userPrompt: prompt,
    }).subscribe({
      next: ({ proposedText }) => {
        this.generating.set(false);
        this.promptKey.set(null);
        this.editText = proposedText;
        this.editKey.set(this.editKeyFor(entry, section));
      },
      error: () => this.generating.set(false),
    });
  }

  // ─── Display ─────────────────────────────────────────────────────────────────

  displayDiff(entry: DocEntry, section: ClauseSection): SafeHtml {
    const key = this.editKeyFor(entry, section);
    const override = this.overrides()[key];
    return this.safe(override?.diffHtml ?? section.diffHtml ?? '');
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
