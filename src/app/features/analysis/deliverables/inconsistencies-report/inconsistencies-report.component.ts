import { Component, input, signal, computed } from '@angular/core';
import type { InconsistenciesReportContent, InconsistencyLevel } from '../../../../core/models/deliverable.model';

@Component({
  selector: 'app-inconsistencies-report',
  templateUrl: './inconsistencies-report.component.html',
  imports: [],
})
export class InconsistenciesReportComponent {
  content = input.required<InconsistenciesReportContent>();
  filterLevel = signal<InconsistencyLevel | 'all'>('all');
  expandedGroup = signal<string | null>(null);

  filteredGroups = computed(() => {
    const groups = this.content().groups ?? [];
    const f = this.filterLevel();
    if (f === 'all') return groups;
    return groups.filter(g => g.rows.some(r => r.level === f));
  });

  toggleGroup(clauseType: string) {
    this.expandedGroup.update(cur => cur === clauseType ? null : clauseType);
  }

  levelColor(l: InconsistencyLevel) {
    return {
      aligned: 'bg-green-100 text-green-700',
      variant: 'bg-yellow-100 text-yellow-700',
      divergent: 'bg-red-100 text-red-700',
    }[l] ?? 'bg-gray-100 text-gray-600';
  }

  levelLabel(l: InconsistencyLevel) {
    return { aligned: '🟢 Aligné', variant: '🟠 Variante', divergent: '🔴 Divergence' }[l] ?? l;
  }

  worstLevel(group: InconsistenciesReportContent['groups'][number]): InconsistencyLevel {
    const rows = group.rows;
    if (rows.some(r => r.level === 'divergent')) return 'divergent';
    if (rows.some(r => r.level === 'variant')) return 'variant';
    return 'aligned';
  }

  countByLevel(level: InconsistencyLevel) {
    const groups = this.content().groups ?? [];
    return groups.filter(g => this.worstLevel(g) === level).length;
  }
}
