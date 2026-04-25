import { Component, input, signal, computed } from '@angular/core';
import type { DeadlinesTableContent } from '../../../../core/models/deliverable.model';

@Component({
  selector: 'app-deadlines-table',
  templateUrl: './deadlines-table.component.html',
  imports: [],
})
export class DeadlinesTableComponent {
  content = input.required<DeadlinesTableContent>();
  filterNear = signal(false);

  filteredRows = computed(() => {
    const rows = this.content().rows ?? [];
    return this.filterNear() ? rows.filter(r => r.isNearTerm) : rows;
  });

  nearTermCount = computed(() => (this.content().rows ?? []).filter(r => r.isNearTerm).length);

  deadlineTypeLabel(t: string) {
    const labels: Record<string, string> = {
      RENOUVELLEMENT_AUTO: 'Renouvellement auto.',
      PREAVIS: 'Préavis',
      FIN_GARANTIE: 'Fin de garantie',
      DELAI_CONDITIONNEL: 'Délai conditionnel',
      DATE_LIVRAISON: 'Date de livraison',
      AUTRE: 'Autre',
    };
    return labels[t] ?? t.replace(/_/g, ' ');
  }
}
