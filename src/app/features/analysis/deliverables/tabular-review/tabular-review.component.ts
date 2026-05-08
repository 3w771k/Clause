import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnalysisService, TabularReview, TabularColumn, TabularRow, TabularCell, Workflow } from '../../../../core/services/analysis.service';
import { ColumnEditMenuComponent } from './column-edit-menu.component';

@Component({
  selector: 'app-tabular-review',
  standalone: true,
  imports: [FormsModule, ColumnEditMenuComponent],
  host: { class: 'flex-1 flex flex-col overflow-hidden min-h-0 min-w-0' },
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

  // Column edit menu
  openColumnMenu = signal<string | null>(null);
  columnMenuPos = signal<{ top: number; left: number }>({ top: 0, left: 0 });
  columnRerunning = signal<Set<string>>(new Set());
  toastError = signal('');
  showAddColumnForm = signal(false);
  newColumnLabel = signal('');
  newColumnQuestion = signal('');
  newColumnType = signal('text');

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

  updateCustomColumn(i: number, key: 'label' | 'question', value: string) {
    this.customColumns.update(cols =>
      cols.map((c, idx) => idx === i ? { ...c, [key]: value } : c),
    );
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

  // ─── Column edition ────────────────────────────────────────────────────────

  isColumnRerunning(colId: string): boolean {
    return this.columnRerunning().has(colId);
  }

  openMenuColumn(): TabularColumn | null {
    const id = this.openColumnMenu();
    if (!id) return null;
    return this.activeReview()?.columns.find(c => c.id === id) ?? null;
  }

  toggleColumnMenu(colId: string, event: Event) {
    event.stopPropagation();
    if (this.openColumnMenu() === colId) {
      this.openColumnMenu.set(null);
      return;
    }
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    this.columnMenuPos.set({ top: rect.bottom + 4, left: Math.max(8, rect.right - 288) });
    this.openColumnMenu.set(colId);
  }

  private flashError(msg: string) {
    this.toastError.set(msg);
    setTimeout(() => this.toastError.set(''), 3000);
  }

  onColumnSave(col: TabularColumn, payload: { label: string; question: string; expectedType: string; rerun: boolean }) {
    const r = this.activeReview();
    if (!r) return;
    const patch: { label?: string; question?: string; expectedType?: string } = {};
    if (payload.label !== col.label) patch.label = payload.label;
    if (payload.question !== col.question) patch.question = payload.question;
    if (payload.expectedType !== (col.expectedType ?? 'text')) patch.expectedType = payload.expectedType;
    if (!Object.keys(patch).length) { this.openColumnMenu.set(null); return; }

    if (payload.rerun) this.markColumnRerunning(col.id, true);
    this.svc.updateTabularColumn(this.anaId, r.id, col.id, patch, payload.rerun).subscribe({
      next: full => {
        this.activeReview.set(full);
        this.openColumnMenu.set(null);
        this.markColumnRerunning(col.id, false);
      },
      error: err => {
        this.flashError(err?.error?.error ?? 'Erreur lors de la modification');
        this.markColumnRerunning(col.id, false);
      },
    });
  }

  onColumnDelete(col: TabularColumn) {
    const r = this.activeReview();
    if (!r) return;
    this.svc.deleteTabularColumn(this.anaId, r.id, col.id).subscribe({
      next: () => {
        this.activeReview.update(rev => rev ? {
          ...rev,
          columns: rev.columns.filter(c => c.id !== col.id),
          rows: rev.rows?.map(ro => ({ ...ro, cells: ro.cells.filter(c => c.columnId !== col.id) })),
        } : rev);
        this.openColumnMenu.set(null);
      },
      error: err => this.flashError(err?.error?.error ?? 'Suppression impossible'),
    });
  }

  onColumnAddAfter(col: TabularColumn) {
    this.openColumnMenu.set(null);
    this.startAddColumn(col.id);
  }

  onColumnRerun(col: TabularColumn) {
    const r = this.activeReview();
    if (!r) return;
    this.markColumnRerunning(col.id, true);
    this.svc.rerunTabularColumn(this.anaId, r.id, col.id).subscribe({
      next: full => {
        this.activeReview.set(full);
        this.markColumnRerunning(col.id, false);
        this.openColumnMenu.set(null);
      },
      error: err => {
        this.flashError(err?.error?.error ?? 'Erreur lors du recalcul');
        this.markColumnRerunning(col.id, false);
      },
    });
  }

  private markColumnRerunning(colId: string, on: boolean) {
    this.columnRerunning.update(s => {
      const next = new Set(s);
      if (on) next.add(colId); else next.delete(colId);
      return next;
    });
  }

  private addAfterColumnId: string | null = null;
  startAddColumn(afterColId: string | null = null) {
    this.addAfterColumnId = afterColId;
    this.newColumnLabel.set('');
    this.newColumnQuestion.set('');
    this.newColumnType.set('text');
    this.showAddColumnForm.set(true);
  }

  cancelAddColumn() {
    this.showAddColumnForm.set(false);
    this.addAfterColumnId = null;
  }

  submitAddColumn() {
    const r = this.activeReview();
    if (!r) return;
    const label = this.newColumnLabel().trim();
    const question = this.newColumnQuestion().trim();
    if (!label || !question) return;
    const payload: { label: string; question: string; expectedType?: string; afterColumnId?: string } = {
      label, question, expectedType: this.newColumnType(),
    };
    if (this.addAfterColumnId) payload.afterColumnId = this.addAfterColumnId;
    this.svc.addTabularColumn(this.anaId, r.id, payload).subscribe({
      next: full => {
        this.activeReview.set(full);
        this.cancelAddColumn();
      },
      error: err => this.flashError(err?.error?.error ?? 'Ajout impossible'),
    });
  }
}
