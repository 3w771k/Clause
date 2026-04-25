import { Component, input, signal, computed } from '@angular/core';
import type { MaTableContent, MaEngagementRow } from '../../../../core/models/deliverable.model';

@Component({
  selector: 'app-ma-table',
  templateUrl: './ma-table.component.html',
  imports: [],
})
export class MaTableComponent {
  content = input.required<MaTableContent>();
  filterRisk = signal<'all' | 'high' | 'medium' | 'low'>('all');

  filteredRows = computed(() => {
    const rows = this.content().rows ?? [];
    const f = this.filterRisk();
    const filtered = f === 'all' ? rows : rows.filter(r => r.riskLevel === f);
    const order = { high: 3, medium: 2, low: 1 };
    return [...filtered].sort((a, b) => (order[b.riskLevel] ?? 0) - (order[a.riskLevel] ?? 0));
  });

  clauseTypeLabel(t: string) {
    const labels: Record<string, string> = {
      CHANGEMENT_CONTROLE: 'Changement de contrôle',
      RESILIATION_AUTO: 'Résiliation automatique',
      EXCLUSIVITE: 'Exclusivité',
      PENALITES: 'Pénalités',
      NON_CONCURRENCE: 'Non-concurrence',
      AUTRE: 'Autre',
    };
    return labels[t] ?? t.replace(/_/g, ' ');
  }

  riskColor(r: MaEngagementRow['riskLevel']) {
    return {
      high: 'bg-red-100 text-red-700',
      medium: 'bg-yellow-100 text-yellow-700',
      low: 'bg-green-100 text-green-700',
    }[r] ?? 'bg-gray-100 text-gray-600';
  }

  riskLabel(r: MaEngagementRow['riskLevel']) {
    return { high: '🔴 Élevé', medium: '🟠 Modéré', low: '🟢 Faible' }[r] ?? r;
  }
}
