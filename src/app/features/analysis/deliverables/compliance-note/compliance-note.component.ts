import { Component, input, signal, computed } from '@angular/core';
import type { ComplianceNoteContent, ComplianceStatus } from '../../../../core/models/deliverable.model';

@Component({
  selector: 'app-compliance-note',
  templateUrl: './compliance-note.component.html',
  imports: [],
})
export class ComplianceNoteComponent {
  content = input.required<ComplianceNoteContent>();
  filterStatus = signal<ComplianceStatus | 'all'>('all');

  filteredRows = computed(() => {
    const rows = this.content().rows ?? [];
    const f = this.filterStatus();
    const filtered = f === 'all' ? rows : rows.filter(r => r.status === f);
    const order = { non_conforme: 3, attention: 2, conforme: 1 };
    return [...filtered].sort((a, b) => (order[b.status] ?? 0) - (order[a.status] ?? 0));
  });

  statusColor(s: ComplianceStatus) {
    return {
      conforme: 'bg-green-100 text-green-700',
      attention: 'bg-yellow-100 text-yellow-700',
      non_conforme: 'bg-red-100 text-red-700',
    }[s] ?? 'bg-gray-100 text-gray-600';
  }

  statusLabel(s: ComplianceStatus) {
    return { conforme: '✅ Conforme', attention: '⚠ Attention', non_conforme: '🔴 Non conforme' }[s] ?? s;
  }

  countByStatus(s: ComplianceStatus) {
    return (this.content().rows ?? []).filter(r => r.status === s).length;
  }
}
