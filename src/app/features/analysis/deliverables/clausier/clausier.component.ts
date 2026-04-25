import { Component, input, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../../../core/services/api.service';
import type {
  ClausierContent,
  ClausierEntry,
  ClausierFlatView,
  ClausierFlatRow,
  ClausierCustomColumn,
  ClausierCustomCell,
  ClausierStructuredField,
} from '../../../../core/models/deliverable.model';

interface DocClauseRow {
  clauseType: string;
  clauseLabel: string;
  text: string;
  isBestVersion: boolean;
  divergent: boolean;
}

interface DocSection {
  docId: string;
  docName: string;
  clauses: DocClauseRow[];
}

@Component({
  selector: 'app-clausier',
  templateUrl: './clausier.component.html',
  imports: [],
})
export class ClausierComponent {
  content = input.required<ClausierContent>();
  deliverableId = input.required<string>();

  private http = inject(HttpClient);
  private api = inject(ApiService);

  viewMode = signal<'clause' | 'document' | 'tableau'>('clause');
  expandedClause = signal<string | null>(null);
  expandedDoc = signal<string | null>(null);

  // Flat view signals
  flatView = signal<ClausierFlatView | null>(null);
  loadingTcd = signal(false);
  addingColumn = signal(false);
  addColumnOpen = signal(false);
  addColumnMode = signal<'pick' | 'custom'>('pick');

  // Sort
  sortKey = signal<string>('clauseLabel');
  sortDir = signal<'asc' | 'desc'>('asc');

  // Add column form
  newColName = signal('');
  newColType = signal<'text' | 'amount' | 'date' | 'boolean' | 'percentage'>('text');
  newColInstruction = signal('');

  sortedRows = computed<ClausierFlatRow[]>(() => {
    const fv = this.flatView();
    if (!fv) return [];
    const key = this.sortKey() as keyof ClausierFlatRow;
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return [...fv.rows].sort((a, b) => {
      const va = String(a[key] ?? '');
      const vb = String(b[key] ?? '');
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  });

  availableStructuredKeys = computed<string[]>(() => {
    const fv = this.flatView();
    if (!fv) return [];
    const selected = new Set(fv.selectedStructuredKeys ?? []);
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const row of fv.rows) {
      for (const field of row.structuredFields ?? []) {
        if (!seen.has(field.key) && !selected.has(field.key)) {
          keys.push(field.key);
          seen.add(field.key);
        }
      }
    }
    return keys;
  });

  getStructuredField(row: ClausierFlatRow, key: string): string | null {
    return row.structuredFields?.find(f => f.key === key)?.value ?? null;
  }

  addStructuredKey(key: string) {
    this.http.post<ClausierFlatView>(
      `${this.api.base}/deliverables/${this.deliverableId()}/tcd/columns`,
      { fromStructuredField: true, key },
    ).subscribe({ next: (fv) => this.flatView.set(fv) });
  }

  deleteStructuredKey(key: string) {
    this.http.delete<ClausierFlatView>(
      `${this.api.base}/deliverables/${this.deliverableId()}/tcd/structured-keys/${encodeURIComponent(key)}`,
    ).subscribe({ next: (fv) => this.flatView.set(fv) });
  }

  rowGroups = computed<Array<{ row: ClausierFlatRow; isGroupStart: boolean }>>(() => {
    const rows = this.sortedRows();
    return rows.map((row, i) => ({
      row,
      isGroupStart: i === 0 || rows[i - 1].clauseLabel !== row.clauseLabel,
    }));
  });

  sort(key: string) {
    if (this.sortKey() === key) {
      this.sortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
  }

  getCell(docId: string, colId: string): ClausierCustomCell | null {
    return this.flatView()?.cellsByDoc[docId]?.[colId] ?? null;
  }

  switchToTableau() {
    this.viewMode.set('tableau');
    if (!this.flatView()) {
      this.loadTcd();
    }
  }

  loadTcd() {
    this.loadingTcd.set(true);
    this.http.get<ClausierFlatView>(`${this.api.base}/deliverables/${this.deliverableId()}/tcd`).subscribe({
      next: (fv) => { this.flatView.set(fv); this.loadingTcd.set(false); },
      error: () => this.loadingTcd.set(false),
    });
  }

  openAddColumn() {
    this.newColName.set('');
    this.newColType.set('text');
    this.newColInstruction.set('');
    this.addColumnMode.set(this.availableStructuredKeys().length ? 'pick' : 'custom');
    this.addColumnOpen.set(true);
  }

  submitAddColumn() {
    const name = this.newColName().trim();
    if (!name) return;
    this.addColumnOpen.set(false);
    this.addingColumn.set(true);
    this.http.post<ClausierFlatView>(
      `${this.api.base}/deliverables/${this.deliverableId()}/tcd/columns`,
      { name, dataType: this.newColType(), extractionInstruction: this.newColInstruction().trim() || undefined },
    ).subscribe({
      next: (fv) => { this.flatView.set(fv); this.addingColumn.set(false); },
      error: () => this.addingColumn.set(false),
    });
  }

  deleteColumn(colId: string) {
    this.http.delete<ClausierFlatView>(
      `${this.api.base}/deliverables/${this.deliverableId()}/tcd/columns/${colId}`,
    ).subscribe({
      next: (fv) => this.flatView.set(fv),
    });
  }

  exportExcel() {
    window.open(`${this.api.base}/deliverables/${this.deliverableId()}/tcd/export/xlsx`, '_blank');
  }

  // ─── Par clause / par document ─────────────────────────────────────────────

  toggleClause(key: string) {
    this.expandedClause.update(v => v === key ? null : key);
  }

  toggleDoc(docId: string) {
    this.expandedDoc.update(v => v === docId ? null : docId);
  }

  docSections = computed<DocSection[]>(() => {
    const entries = this.content().entries ?? [];
    const nameMap = new Map<string, string>();
    for (const e of entries) {
      if (e.sourceDocumentId && e.sourceDocumentName) nameMap.set(e.sourceDocumentId, e.sourceDocumentName);
    }
    const docOrder: string[] = [];
    const seen = new Set<string>();
    for (const e of entries) {
      if (e.sourceDocumentId && !seen.has(e.sourceDocumentId)) { docOrder.push(e.sourceDocumentId); seen.add(e.sourceDocumentId); }
      for (const alt of e.alternativeVersions ?? []) {
        if (alt.sourceDocumentId && !seen.has(alt.sourceDocumentId)) { docOrder.push(alt.sourceDocumentId); seen.add(alt.sourceDocumentId); }
      }
    }
    return docOrder.map(docId => {
      const clauseRows: DocClauseRow[] = [];
      for (const e of entries) {
        const isDivergent = (e.alternativeVersions?.length ?? 0) > 0;
        if (e.sourceDocumentId === docId) {
          clauseRows.push({ clauseType: e.clauseType, clauseLabel: e.clauseLabel, text: e.bestVersion, isBestVersion: true, divergent: isDivergent });
        } else {
          const alt = (e.alternativeVersions ?? []).find(a => a.sourceDocumentId === docId);
          if (alt) clauseRows.push({ clauseType: e.clauseType, clauseLabel: e.clauseLabel, text: alt.text, isBestVersion: false, divergent: true });
        }
      }
      const shortId = docId.length > 16 ? docId.substring(0, 14) + '…' : docId;
      return { docId, docName: nameMap.get(docId) ?? shortId, clauses: clauseRows };
    });
  });

  divergenceCount(entry: ClausierEntry) {
    return (entry.alternativeVersions?.length ?? 0) + 1;
  }

  countDivergent(clauseRows: DocClauseRow[]) {
    return clauseRows.filter(c => c.divergent).length;
  }
}
