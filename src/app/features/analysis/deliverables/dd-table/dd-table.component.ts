import { Component, input, signal, computed } from '@angular/core';
import type { DDTableContent, DDTableRow, DDRiskLevel } from '../../../../core/models/deliverable.model';

@Component({
  selector: 'app-dd-table',
  templateUrl: './dd-table.component.html',
  imports: [],
})
export class DDTableComponent {
  content = input.required<DDTableContent>();
  filterRisk = signal<DDRiskLevel | 'all'>('all');
  sortKey = signal<keyof DDTableRow>('riskLevel');
  sortDir = signal<'asc' | 'desc'>('desc');

  filteredRows = computed(() => {
    const rows = this.content().rows ?? [];
    const f = this.filterRisk();
    const filtered = f === 'all' ? rows : rows.filter(r => r.riskLevel === f);
    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const riskOrder = { critical: 5, high: 4, medium: 3, low: 2, ok: 1 };
      if (key === 'riskLevel') {
        return ((riskOrder[b.riskLevel as DDRiskLevel] ?? 0) - (riskOrder[a.riskLevel as DDRiskLevel] ?? 0)) * dir;
      }
      const va = String(a[key] ?? '');
      const vb = String(b[key] ?? '');
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  });

  sort(key: keyof DDTableRow) {
    if (this.sortKey() === key) this.sortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    else { this.sortKey.set(key); this.sortDir.set('desc'); }
  }

  riskLabel(r: DDRiskLevel) {
    return { ok: 'OK', low: 'Faible', medium: 'Modéré', high: 'Élevé', critical: 'Critique' }[r] ?? r;
  }

  riskColor(r: DDRiskLevel) {
    return {
      ok: 'bg-green-100 text-green-700',
      low: 'bg-blue-100 text-blue-700',
      medium: 'bg-yellow-100 text-yellow-700',
      high: 'bg-orange-100 text-orange-700',
      critical: 'bg-red-100 text-red-700',
    }[r] ?? 'bg-gray-100 text-gray-600';
  }
}
