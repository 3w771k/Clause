import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnalysisService, TabularReview, TabularColumn, TabularRow, TabularCell, Workflow } from '../../../../core/services/analysis.service';

@Component({
  selector: 'app-tabular-review',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './tabular-review.component.html',
})
export class TabularReviewComponent implements OnInit {
  @Input() anaId!: string;
  @Input() wsId!: string;

  private svc = inject(AnalysisService);

  // Document labels: documentId → fileName
  private docLabels = new Map<string, string>();

  // State
  reviews = signal<TabularReview[]>([]);
  activeReview = signal<TabularReview | null>(null);
  workflows = signal<Workflow[]>([]);

  // Creation panel
  showCreate = signal(false);
  newName = signal('');
  selectedWorkflowId = signal('');
  customColumns = signal<Array<{ label: string; question: string }>>([]);
  mode = signal<'workflow' | 'custom'>('workflow');

  // Run state
  running = signal(false);
  runError = signal('');

  // Chat
  showChat = signal(false);
  chatQuestion = signal('');
  chatResult = signal<{ question: string; generatedSql: string; result: Record<string, unknown>[]; error: string | null } | null>(null);
  chatLoading = signal(false);

  // Cell context menu
  contextCell = signal<{ row: TabularRow; cell: TabularCell; col: TabularColumn } | null>(null);
  editingCell = signal<string | null>(null);
  editValue = signal('');

  // Citation popover
  activeCitation = signal<{ excerpt: string; page: number | null } | null>(null);

  confidenceClass = computed(() => (conf: string) => {
    switch (conf) {
      case 'high': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'medium': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'low': return 'bg-red-50 text-red-700 border-red-200';
      default: return 'bg-gray-50 text-gray-400 border-gray-200';
    }
  });

  confidenceLabel: Record<string, string> = {
    high: '✓ Certain',
    medium: '~ Probable',
    low: '? Incertain',
    absent: '— Absent',
  };

  ngOnInit() {
    this.loadReviews();
    this.svc.listWorkflows().subscribe({ next: wf => this.workflows.set(wf), error: () => {} });
  }

  loadReviews() {
    this.svc.listTabularReviews(this.anaId).subscribe({
      next: reviews => {
        this.reviews.set(reviews);
        if (reviews.length && !this.activeReview()) this.openReview(reviews[0]);
      },
      error: () => {},
    });
  }

  openReview(review: TabularReview) {
    this.svc.getTabularReview(this.anaId, review.id).subscribe({
      next: full => {
        this.activeReview.set(full);
        full.rows?.forEach(r => {
          if (r.fileName) this.docLabels.set(r.documentId, r.fileName);
        });
      },
      error: () => this.activeReview.set(review),
    });
  }

  getDocLabel(documentId: string): string {
    return this.docLabels.get(documentId) ?? documentId.substring(0, 10) + '…';
  }

  createReview() {
    const name = this.newName().trim();
    if (!name) return;

    const payload: { name: string; workflowId?: string; columns?: TabularColumn[] } = { name };

    if (this.mode() === 'workflow' && this.selectedWorkflowId()) {
      const wf = this.workflows().find(w => w.id === this.selectedWorkflowId());
      payload.workflowId = this.selectedWorkflowId();
      if (wf) {
        payload.columns = wf.definition.columns.map((c, i) => ({
          id: `col_${i}`,
          label: c.label,
          question: c.question,
          expectedType: c.expectedType,
        }));
      }
    } else {
      payload.columns = this.customColumns()
        .filter(c => c.label.trim())
        .map((c, i) => ({ id: `col_${i}`, label: c.label, question: c.question, expectedType: 'text' }));
    }

    this.svc.createTabularReview(this.anaId, payload).subscribe({
      next: created => {
        this.reviews.update(list => [...list, created]);
        this.activeReview.set(created);
        this.showCreate.set(false);
        this.newName.set('');
        this.selectedWorkflowId.set('');
        this.customColumns.set([]);
      },
      error: () => {},
    });
  }

  runReview() {
    const r = this.activeReview();
    if (!r) return;
    this.running.set(true);
    this.runError.set('');
    this.svc.runTabularReview(this.anaId, r.id).subscribe({
      next: () => {
        this.svc.getTabularReview(this.anaId, r.id).subscribe({
          next: full => { this.activeReview.set(full); this.running.set(false); },
          error: () => this.running.set(false),
        });
      },
      error: (err) => {
        this.runError.set(err?.error?.error ?? 'Erreur lors de l\'exécution');
        this.running.set(false);
      },
    });
  }

  rerunCell(row: TabularRow, col: TabularColumn) {
    const r = this.activeReview();
    if (!r) return;
    const cell = row.cells.find(c => c.columnId === col.id);
    if (!cell) return;
    this.svc.rerunTabularCell(this.anaId, r.id, row.id, col.id).subscribe({
      next: updated => {
        this.activeReview.update(rev => {
          if (!rev) return rev;
          return {
            ...rev,
            rows: rev.rows?.map(ro => ro.id === row.id
              ? { ...ro, cells: ro.cells.map(c => c.columnId === col.id ? updated : c) }
              : ro
            ),
          };
        });
      },
      error: () => {},
    });
    this.contextCell.set(null);
  }

  startEditCell(row: TabularRow, col: TabularColumn) {
    const cell = row.cells.find(c => c.columnId === col.id);
    this.editingCell.set(`${row.id}-${col.id}`);
    this.editValue.set(cell?.value ?? '');
    this.contextCell.set(null);
  }

  saveEditCell(row: TabularRow, col: TabularColumn) {
    const r = this.activeReview();
    if (!r) return;
    this.svc.updateTabularCell(this.anaId, r.id, row.id, col.id, this.editValue()).subscribe({
      next: updated => {
        this.activeReview.update(rev => {
          if (!rev) return rev;
          return {
            ...rev,
            rows: rev.rows?.map(ro => ro.id === row.id
              ? { ...ro, cells: ro.cells.map(c => c.columnId === col.id ? updated : c) }
              : ro
            ),
          };
        });
        this.editingCell.set(null);
      },
      error: () => this.editingCell.set(null),
    });
  }

  getCell(row: TabularRow, col: TabularColumn): TabularCell | undefined {
    return row.cells.find(c => c.columnId === col.id);
  }

  showCitation(cell: TabularCell) {
    if (!cell.citationJson) return;
    try {
      const c = JSON.parse(cell.citationJson);
      if (c.excerpt) this.activeCitation.set({ excerpt: c.excerpt, page: c.page ?? null });
    } catch {}
  }

  addCustomColumn() {
    this.customColumns.update(cols => [...cols, { label: '', question: '' }]);
  }

  removeCustomColumn(i: number) {
    this.customColumns.update(cols => cols.filter((_, idx) => idx !== i));
  }

  sendChatQuestion() {
    const r = this.activeReview();
    if (!r || !this.chatQuestion().trim()) return;
    this.chatLoading.set(true);
    this.svc.queryTabularReview(this.anaId, r.id, this.chatQuestion()).subscribe({
      next: res => { this.chatResult.set(res); this.chatLoading.set(false); },
      error: () => this.chatLoading.set(false),
    });
  }

  chatResultKeys(): string[] {
    const res = this.chatResult();
    if (!res?.result?.length) return [];
    return Object.keys(res.result[0]);
  }

  get selectedWorkflow(): Workflow | undefined {
    return this.workflows().find(w => w.id === this.selectedWorkflowId());
  }
}
