import { Component, input, signal, effect, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../../../core/services/api.service';
import type { ReviewNoteContent, ReviewNoteSection, ReviewGapLevel } from '../../../../core/models/deliverable.model';

@Component({
  selector: 'app-review-note',
  templateUrl: './review-note.component.html',
})
export class ReviewNoteComponent {
  content = input.required<ReviewNoteContent>();
  deliverableId = input<string | null>(null);

  private http = inject(HttpClient);
  private api = inject(ApiService);

  sections = signal<ReviewNoteSection[]>([]);

  readonly gapLevels: ReviewGapLevel[] = ['none', 'minor', 'major', 'blocking'];

  constructor() {
    effect(() => {
      this.sections.set(this.content().sections?.map(s => ({ ...s })) ?? []);
    });
  }

  setGapLevel(index: number, level: ReviewGapLevel) {
    this.sections.update(list => {
      const updated = [...list];
      updated[index] = { ...updated[index], gapLevel: level };
      return updated;
    });
    this.save();
  }

  private save() {
    const id = this.deliverableId();
    if (!id) return;
    const updated: ReviewNoteContent = { ...this.content(), sections: this.sections() };
    this.http.put(`${this.api.base}/deliverables/${id}`, { content: updated }).subscribe();
  }

  verdictLabel(v: string) {
    return { conforme: 'Conforme', a_negocier: 'À négocier', non_conforme: 'Non conforme' }[v] ?? v;
  }

  verdictColor(v: string) {
    return { conforme: 'bg-green-100 text-green-700', a_negocier: 'bg-orange-100 text-orange-700', non_conforme: 'bg-red-100 text-red-700' }[v] ?? 'bg-gray-100 text-gray-600';
  }

  gapLabel(g: ReviewGapLevel) {
    return { none: 'Conforme', minor: 'Mineur', major: 'Majeur', blocking: 'Bloquant' }[g] ?? g;
  }

  gapColor(g: ReviewGapLevel) {
    return { none: 'bg-green-100 text-green-700', minor: 'bg-blue-100 text-blue-700', major: 'bg-orange-100 text-orange-700', blocking: 'bg-red-100 text-red-700' }[g] ?? 'bg-gray-100 text-gray-600';
  }
}
