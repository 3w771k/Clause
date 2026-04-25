import { Component, input } from '@angular/core';
import type { DDSynthesisContent, DDRiskLevel } from '../../../../core/models/deliverable.model';

@Component({
  selector: 'app-dd-synthesis',
  templateUrl: './dd-synthesis.component.html',
  imports: [],
})
export class DDSynthesisComponent {
  content = input.required<DDSynthesisContent>();

  riskLabel(r: DDRiskLevel) {
    return { ok: 'Conforme', low: 'Faible', medium: 'Modéré', high: 'Élevé', critical: 'Critique' }[r] ?? r;
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
