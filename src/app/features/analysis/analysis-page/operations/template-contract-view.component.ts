import { Component, Input, Output, EventEmitter, OnChanges, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { ApiService } from '../../../../core/services/api.service';
import { ReferenceBaseService } from '../../../../core/services/reference-base.service';
import { AnalysisService } from '../../../../core/services/analysis.service';
import type { Analysis } from '../../../../core/models/analysis.model';
import type { Deliverable, RedlineContent, ClauseSection } from '../../../../core/models/deliverable.model';
import type { ReferenceAsset } from '../../../../core/models/reference-asset.model';
import type { StandardContent, PlaybookContent, ClausierAssetContent } from '../../../../core/models/asset-content.model';

const ALLOWED = {
  ALLOWED_TAGS: ['del', 'ins', 'p', 'span', 'em', 'strong', 'br'],
  ALLOWED_ATTR: ['class'],
};

@Component({
  selector: 'app-template-contract-view',
  standalone: true,
  imports: [FormsModule],
  host: { class: 'flex-1 flex overflow-hidden min-h-0 min-w-0' },
  template: `
    <!-- ═══ Panneau gauche : clauses ═══════════════════════════════════════ -->
    <div class="flex-1 flex flex-col overflow-hidden min-w-0 bg-gray-50 border-r border-gray-200">

      <!-- Header -->
      <div class="px-5 py-3 border-b border-gray-200 bg-white shrink-0 flex items-center gap-3">
        @if (template()) {
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded font-medium shrink-0">Template</span>
            <span class="text-sm font-medium text-gray-800 truncate">{{ template()!.name }}</span>
          </div>
        } @else {
          <span class="text-xs text-gray-400">Chargement du template…</span>
        }
        <div class="flex-1"></div>
        @if (draftExists()) {
          <span class="text-xs text-gray-500">{{ clauseSections().length }} clause(s) générée(s)</span>
          <button (click)="regenerate()" [disabled]="generating()" class="btn-secondary text-xs">
            ↺ Regénérer
          </button>
        }
      </div>

      <!-- Corps -->
      <div class="flex-1 overflow-y-auto p-5 min-h-0">
        <div class="max-w-2xl mx-auto space-y-3">

          <!-- PRÉ-GÉNÉRATION : aperçu template grisé -->
          @if (!draftExists() && !generating()) {
            @if (!template()) {
              <!-- Skeleton pendant le chargement du template -->
              @for (i of [1,2,3,4]; track i) {
                <div class="bg-white border border-gray-200 rounded-lg px-4 py-3 animate-pulse">
                  <div class="h-2.5 bg-gray-200 rounded w-1/3 mb-2"></div>
                  <div class="h-2 bg-gray-100 rounded w-full mb-1"></div>
                  <div class="h-2 bg-gray-100 rounded w-4/5"></div>
                </div>
              }
            } @else if (templateClauses().length) {
              @for (item of templateClauses(); track item.type) {
                <div class="bg-white border border-gray-200 rounded-lg px-4 py-3 opacity-60">
                  <div class="flex items-center gap-2 mb-1.5">
                    @if (item.sectionHeading) {
                      <span class="text-[10px] font-semibold uppercase tracking-wide text-indigo-400">{{ item.sectionHeading }}</span>
                    }
                    <span class="text-xs text-gray-400">{{ item.type }}</span>
                  </div>
                  <p class="text-xs text-gray-500 leading-relaxed line-clamp-3">{{ item.text }}</p>
                </div>
              }
            } @else {
              <p class="text-sm text-gray-400 text-center py-10">Aucune clause dans ce template.</p>
            }
          }

          <!-- GÉNÉRATION EN COURS -->
          @if (generating()) {
            <div class="flex flex-col items-center justify-center py-20 text-center">
              <svg class="w-8 h-8 text-indigo-400 animate-spin mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
              </svg>
              @if (generatingWithContext()) {
                <p class="text-sm font-medium text-gray-700">Rédaction en cours…</p>
                <p class="text-xs text-gray-400 mt-1">Claude adapte chaque clause au contexte fourni.</p>
              } @else {
                <p class="text-sm font-medium text-gray-700">Chargement du template…</p>
              }
            </div>
          }

          <!-- POST-GÉNÉRATION : clauses avec diff coloré -->
          @if (draftExists() && !generating()) {
            @for (section of clauseSections(); track section.clauseType) {
              <div class="bg-white border rounded-lg overflow-hidden cursor-pointer transition-all"
                   [class]="focusedClause() === section.clauseType
                     ? 'border-indigo-400 ring-1 ring-indigo-200 shadow-sm'
                     : editingClause() === section.clauseType
                       ? 'border-indigo-300 ring-1 ring-indigo-100'
                       : promptingClause() === section.clauseType
                         ? 'border-violet-300 ring-1 ring-violet-100'
                         : 'border-gray-200 hover:border-gray-300'"
                   (click)="setFocus(section.clauseType)">

                <!-- En-tête de clause -->
                <div class="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-inherit">
                  <span class="text-xs font-semibold text-gray-700 uppercase tracking-wide">{{ section.clauseType }}</span>
                  <div class="flex items-center gap-1.5" (click)="$event.stopPropagation()">
                    <button (click)="startEdit(section)" class="px-2 py-1 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600">Modifier</button>
                    <button (click)="startPrompt(section)" class="px-2 py-1 text-xs rounded border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700">✦ Prompter</button>
                  </div>
                </div>

                <!-- Mode édition -->
                @if (editingClause() === section.clauseType) {
                  <div class="p-4 space-y-3 bg-indigo-50/30" (click)="$event.stopPropagation()">
                    <textarea [(ngModel)]="editText" rows="5"
                              class="w-full text-sm border border-indigo-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white resize-y font-mono"></textarea>
                    <div class="text-sm leading-relaxed p-3 bg-white border border-gray-200 rounded-md"
                         [innerHTML]="liveEditDiff(section)"></div>
                    <div class="flex gap-2">
                      <button (click)="applyEdit(section)" class="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Appliquer</button>
                      <button (click)="cancelEdit()" class="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-md hover:bg-gray-50 text-gray-600">Annuler</button>
                    </div>
                  </div>
                }

                <!-- Mode prompt IA -->
                @else if (promptingClause() === section.clauseType) {
                  <div class="p-4 space-y-2 bg-violet-50/30" (click)="$event.stopPropagation()">
                    <div class="flex gap-2">
                      <input type="text" [(ngModel)]="promptText"
                             placeholder="Ex : Raccourcis la durée à 6 mois, ajoute une clause de résiliation anticipée…"
                             class="flex-1 text-sm border border-violet-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                             (keydown.enter)="submitPrompt(section)" />
                      <button (click)="submitPrompt(section)" [disabled]="promptGenerating()"
                              class="px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50">
                        @if (promptGenerating()) { … } @else { Envoyer }
                      </button>
                      <button (click)="cancelPrompt()" class="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-md hover:bg-gray-50 text-gray-600">✕</button>
                    </div>
                    @if (promptGenerating()) { <p class="text-xs text-violet-600">Génération en cours…</p> }
                  </div>
                }

                <!-- Diff affiché -->
                @else {
                  <div class="px-4 py-3">
                    <div class="text-sm leading-relaxed" [innerHTML]="displayDiff(section)"></div>
                    @if (section.recommendation) {
                      <p class="mt-2 text-xs text-gray-400 italic border-t border-gray-100 pt-2">{{ section.recommendation }}</p>
                    }
                  </div>
                }

              </div>
            }
          }

        </div>
      </div>
    </div>

    <!-- ═══ Panneau droit : prompt ══════════════════════════════════════════ -->
    <div class="w-96 shrink-0 bg-white flex flex-col overflow-hidden">

      <!-- PRÉ-GÉNÉRATION : contexte global -->
      @if (!draftExists() && !generating()) {
        <div class="px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 class="text-sm font-semibold text-gray-800 mb-0.5">Contexte du contrat</h3>
          <p class="text-xs text-gray-400">Décris les éléments clés à inclure dans la rédaction.</p>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          <textarea [(ngModel)]="contextNotes"
                    rows="8"
                    placeholder="Ex : Contrat de prestation de services entre la société ABC (prestataire) et XYZ (client). Durée : 12 mois renouvelable. Montant : 50 000 € HT. Objet : développement d'une application mobile. Droit applicable : droit français. Tribunal compétent : Paris."
                    class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none leading-relaxed"></textarea>

          <div class="space-y-1.5">
            <p class="text-xs text-gray-400 font-medium">Exemples</p>
            @for (ex of contextExamples; track ex.label) {
              <button (click)="contextNotes = ex.text"
                      class="block w-full text-left text-xs px-3 py-2 rounded-md bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors leading-relaxed">
                {{ ex.label }}
              </button>
            }
          </div>
        </div>

        <div class="p-4 border-t border-gray-100 shrink-0">
          <button (click)="generate()"
                  [disabled]="!template() || generating()"
                  class="w-full btn-primary disabled:opacity-50">
            {{ contextNotes.trim() ? 'Générer avec ce contexte' : 'Charger le template' }}
          </button>
          @if (lastError()) {
            <p class="text-xs text-red-600 mt-2 text-center">{{ lastError() }}</p>
          }
        </div>
      }

      <!-- GÉNÉRATION EN COURS : état d'attente -->
      @if (generating()) {
        <div class="flex flex-col items-center justify-center flex-1 text-center px-6">
          <p class="text-sm text-gray-500">Le contrat est en cours de rédaction…</p>
          <p class="text-xs text-gray-400 mt-1">Cela prend 20–40 secondes selon la longueur du template.</p>
        </div>
      }

      <!-- POST-GÉNÉRATION : prompt par clause -->
      @if (draftExists() && !generating()) {
        <div class="px-4 py-3 border-b border-gray-100 shrink-0">
          <h3 class="text-sm font-semibold text-gray-800">Affiner une clause</h3>
          @if (focusedClauseLabel()) {
            <p class="text-xs text-gray-500 mt-0.5">Clause sélectionnée : <span class="font-medium text-indigo-600">{{ focusedClauseLabel() }}</span></p>
          } @else {
            <p class="text-xs text-gray-400 mt-0.5">Clique une clause à gauche pour la cibler.</p>
          }
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          @if (!focusedClause()) {
            <div class="text-center py-8 text-xs text-gray-400 space-y-3">
              <p>Sélectionne une clause pour l'affiner via un prompt.</p>
              <div class="space-y-1.5">
                @for (ex of promptExamples; track ex) {
                  <div class="px-3 py-2 rounded-md bg-gray-50 text-gray-500 text-left">{{ ex }}</div>
                }
              </div>
            </div>
          }

          @for (h of chatHistory(); track h.id) {
            <div [class]="h.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
              <div [class]="h.role === 'user'
                ? 'bg-gray-900 text-white rounded-2xl rounded-tr-sm px-3 py-2 max-w-[90%]'
                : 'bg-gray-100 text-gray-800 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[90%]'"
                   class="text-xs leading-relaxed">
                {{ h.content }}
                @if (h.clauseType) {
                  <span class="text-[10px] opacity-60 block mt-0.5">— {{ h.clauseType }}</span>
                }
              </div>
            </div>
          }
        </div>

        <div class="p-4 border-t border-gray-100 shrink-0">
          @if (!focusedClause()) {
            <p class="text-xs text-amber-600 text-center mb-2">Sélectionne une clause à gauche.</p>
          }
          <div class="flex gap-2">
            <textarea [(ngModel)]="chatInstruction" rows="2"
                      [disabled]="!focusedClause()"
                      (keydown.enter)="$event.preventDefault(); sendChat()"
                      placeholder="Ex : Rends cette clause plus protectrice, ajoute une limitation de responsabilité…"
                      class="flex-1 text-xs px-2.5 py-2 rounded-md border border-gray-300 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none disabled:opacity-50 disabled:bg-gray-50"></textarea>
            <button (click)="sendChat()" [disabled]="!focusedClause() || !chatInstruction.trim() || promptGenerating()"
                    class="btn-primary self-end disabled:opacity-50 text-xs">
              Envoyer
            </button>
          </div>
        </div>
      }

    </div>
  `,
})
export class TemplateContractViewComponent implements OnChanges, OnInit {
  @Input() anaId = '';
  @Input() analysis: Analysis | null = null;
  @Input() deliverables: Deliverable[] = [];
  @Input() referenceAsset: ReferenceAsset | null = null;
  @Output() reload = new EventEmitter<void>();

  private api = inject(ApiService);
  private refSvc = inject(ReferenceBaseService);
  private anaService = inject(AnalysisService);
  private sanitizer = inject(DomSanitizer);

  // Signal mirror of @Input deliverables — computed() can only track signals, not plain @Input arrays
  private deliverables$ = signal<Deliverable[]>([]);

  template = signal<ReferenceAsset | null>(null);
  generating = signal(false);
  generatingWithContext = signal(false);
  lastError = signal('');
  contextNotes = '';
  focusedClause = signal<string | null>(null);
  chatInstruction = '';
  chatHistory = signal<Array<{ id: string; role: 'user' | 'system'; content: string; clauseType?: string }>>([]);

  // Per-clause edit/prompt
  editingClause = signal<string | null>(null);
  editText = '';
  promptingClause = signal<string | null>(null);
  promptText = '';
  promptGenerating = signal(false);
  overrides = signal<Record<string, { diffHtml: string; text: string }>>({});

  readonly contextExamples = [
    { label: 'NDA entre deux startups tech', text: 'Accord de confidentialité entre la société Alpha SAS (divulgateur) et Beta SARL (receveur). Durée : 3 ans. Objet : évaluation d\'un partenariat commercial pour un projet de développement logiciel. Droit français, tribunal de Paris.' },
    { label: 'Prestation de services IT', text: 'Contrat de prestation entre ABC Consulting (prestataire) et XYZ Corp (client). Durée : 12 mois. Montant : 80 000 € HT. Objet : développement et maintenance d\'une application SaaS. Pénalités de retard : 0,5%/semaine.' },
    { label: 'Bail commercial', text: 'Bail commercial entre le bailleur M. Dupont et le preneur Boulangerie du Marché SARL. Local situé 12 rue de la Paix, Paris 75001. Surface : 85 m². Loyer : 2 500 € HT/mois. Durée : 3-6-9 ans. Destination : boulangerie-pâtisserie.' },
  ];

  readonly promptExamples = [
    'Renforce la clause de responsabilité',
    'Ajoute une clause de résiliation anticipée',
    'Adapte la durée à 24 mois',
  ];

  ngOnInit() { this.syncTemplate(); this.deliverables$.set(this.deliverables); }

  ngOnChanges() { this.syncTemplate(); this.deliverables$.set(this.deliverables); }

  private syncTemplate() {
    const assetId = this.analysis?.referenceAssetId;
    if (!assetId) return;
    // Use the pre-loaded input if it matches — no network call needed
    if (this.referenceAsset?.id === assetId) {
      if (this.template()?.id !== assetId) this.template.set(this.referenceAsset);
      return;
    }
    // Fallback fetch (e.g. component used standalone)
    if (this.template()?.id !== assetId) {
      this.refSvc.get(assetId).subscribe(a => this.template.set(a));
    }
  }

  draftDeliverable = computed(() =>
    this.deliverables$().find(d => d.sourceOperation === 'template_contract') ?? null
  );

  draftExists = computed(() => !!this.draftDeliverable());

  clauseSections = computed<ClauseSection[]>(() =>
    (this.draftDeliverable()?.content as RedlineContent)?.clauseSections ?? []
  );

  templateClauses = computed(() => {
    const t = this.template();
    if (!t) return [];
    if (t.type === 'standard') {
      const content = t.content as StandardContent;
      if (content?.sections?.length) {
        return content.sections.flatMap(sec =>
          sec.clauses.map(c => ({ type: c.clauseTypeOntologyId, text: c.text, sectionHeading: sec.heading }))
        );
      }
      // Legacy format: { clauses: [{ type, label, text }] }
      const legacy = t.content as unknown as { clauses?: Array<{ type?: string; clauseTypeOntologyId?: string; label?: string; text?: string }> };
      return (legacy?.clauses ?? [])
        .filter(c => c.text)
        .map(c => ({ type: c.clauseTypeOntologyId ?? c.type ?? 'clause', text: c.text ?? '', sectionHeading: c.label ?? c.type ?? 'Clause' }));
    }
    if (t.type === 'playbook') {
      const content = t.content as PlaybookContent;
      return (content?.sections ?? []).map(s => ({
        type: s.clauseType,
        text: s.positions?.ideal?.description ?? s.positions?.fallback?.description ?? s.stakes ?? '',
        sectionHeading: s.clauseType,
      }));
    }
    if (t.type === 'clausier') {
      const content = t.content as ClausierAssetContent;
      return (content?.sections ?? []).map(s => ({ type: s.clauseTypeOntologyId, text: s.variants[0]?.text ?? '', sectionHeading: s.title }));
    }
    return [];
  });

  focusedClauseLabel = computed(() => {
    const id = this.focusedClause();
    if (!id) return null;
    return this.clauseSections().find(s => s.clauseType === id)?.clauseType ?? id;
  });

  setFocus(type: string) {
    if (this.editingClause() === type || this.promptingClause() === type) return;
    this.focusedClause.set(this.focusedClause() === type ? null : type);
  }

  // ─── Génération ──────────────────────────────────────────────────────────────

  generate() {
    if (!this.analysis?.id && !this.anaId) return;
    this.generating.set(true);
    this.lastError.set('');
    this.generatingWithContext.set(!!this.contextNotes.trim());
    const id = this.anaId || this.analysis!.id;
    this.api.http.post<{ deliverableId: string; clauseCount: number }>(
      `${this.api.base}/analyses/${id}/generate-from-template`,
      { contextNotes: this.contextNotes },
    ).subscribe({
      next: () => { this.generating.set(false); this.reloadData(); },
      error: (err) => { this.generating.set(false); this.lastError.set(err?.error?.error ?? 'Génération échouée'); },
    });
  }

  regenerate() {
    this.generate();
  }

  private reloadData() {
    this.reload.emit();
  }

  // ─── Chat post-génération ─────────────────────────────────────────────────────

  sendChat() {
    const clauseType = this.focusedClause();
    const instr = this.chatInstruction.trim();
    const id = this.anaId || this.analysis?.id || '';
    if (!clauseType || !instr || !id) return;

    const section = this.clauseSections().find(s => s.clauseType === clauseType);
    if (!section) return;

    this.chatHistory.update(h => [...h, { id: `u_${Date.now()}`, role: 'user', content: instr, clauseType }]);
    this.chatInstruction = '';
    this.promptGenerating.set(true);

    this.anaService.refineClause(id, {
      clauseType,
      textA: section.textA ?? '',
      textB: this.overrides()[clauseType]?.text ?? section.textB ?? '',
      userPrompt: instr,
    }).subscribe({
      next: ({ proposedText }) => {
        this.promptGenerating.set(false);
        this.overrides.update(o => ({
          ...o,
          [clauseType]: { diffHtml: this.wordDiff(section.textA ?? '', proposedText), text: proposedText },
        }));
        this.chatHistory.update(h => [...h, { id: `s_${Date.now()}`, role: 'system', content: 'Clause mise à jour.', clauseType }]);
      },
      error: () => { this.promptGenerating.set(false); },
    });
  }

  // ─── Edit / prompt inline dans les cartes ────────────────────────────────────

  startEdit(section: ClauseSection) {
    const override = this.overrides()[section.clauseType];
    this.editText = override?.text ?? section.textB ?? '';
    this.promptingClause.set(null);
    this.editingClause.set(section.clauseType);
    this.focusedClause.set(null);
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

  startPrompt(section: ClauseSection) {
    this.promptText = '';
    this.editingClause.set(null);
    this.promptingClause.set(section.clauseType);
    this.focusedClause.set(null);
  }

  cancelPrompt() { this.promptingClause.set(null); }

  submitPrompt(section: ClauseSection) {
    const prompt = this.promptText.trim();
    const id = this.anaId || this.analysis?.id || '';
    if (!prompt || !id) return;
    this.promptGenerating.set(true);
    this.anaService.refineClause(id, {
      clauseType: section.clauseType,
      textA: section.textA ?? '',
      textB: this.overrides()[section.clauseType]?.text ?? section.textB ?? '',
      userPrompt: prompt,
    }).subscribe({
      next: ({ proposedText }) => {
        this.promptGenerating.set(false);
        this.promptingClause.set(null);
        this.editText = proposedText;
        this.editingClause.set(section.clauseType);
      },
      error: () => this.promptGenerating.set(false),
    });
  }

  displayDiff(section: ClauseSection): SafeHtml {
    const override = this.overrides()[section.clauseType];
    return this.safe(override?.diffHtml ?? section.diffHtml ?? '');
  }

  private safe(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(html, ALLOWED));
  }

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
