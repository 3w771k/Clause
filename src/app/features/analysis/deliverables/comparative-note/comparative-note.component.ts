import { Component, input } from '@angular/core';
import type { ComparativeNoteContent, GapLevel, SeverityLevel } from '../../../../core/models/deliverable.model';

@Component({
  selector: 'app-comparative-note',
  templateUrl: './comparative-note.component.html',
})
export class ComparativeNoteComponent {
  content = input.required<ComparativeNoteContent>();

  gapLabel(gap: GapLevel): string {
    return { none: 'Conforme', equivalent: 'Équivalent', editorial: 'Éditorial', substantive: 'Substantiel', unfavorable: 'Défavorable', missing: 'Absent' }[gap] ?? gap;
  }

  gapColor(gap: GapLevel): string {
    return {
      none: 'bg-green-100 text-green-700',
      equivalent: 'bg-green-100 text-green-700',
      editorial: 'bg-blue-100 text-blue-700',
      substantive: 'bg-orange-100 text-orange-700',
      unfavorable: 'bg-red-100 text-red-700',
      missing: 'bg-gray-100 text-gray-600',
    }[gap] ?? 'bg-gray-100 text-gray-600';
  }

  overallColor(level: string): string {
    return { none: 'text-green-600', minor: 'text-blue-600', significant: 'text-orange-600', major: 'text-red-600' }[level] ?? 'text-gray-600';
  }

  overallLabel(level: string): string {
    return { none: 'Aucun écart significatif', minor: 'Écarts mineurs', significant: 'Écarts significatifs', major: 'Écarts majeurs' }[level] ?? level;
  }

  severityLabel(severity: SeverityLevel | undefined): string {
    if (!severity) return '';
    return { blocking: 'Bloquant', major: 'Majeur', minor: 'Mineur', ok: 'OK' }[severity] ?? severity;
  }

  severityColor(severity: SeverityLevel | undefined): string {
    if (!severity) return 'bg-gray-100 text-gray-400';
    return {
      blocking: 'bg-red-100 text-red-700',
      major: 'bg-orange-100 text-orange-700',
      minor: 'bg-blue-100 text-blue-700',
      ok: 'bg-green-100 text-green-700',
    }[severity] ?? 'bg-gray-100 text-gray-400';
  }
}
