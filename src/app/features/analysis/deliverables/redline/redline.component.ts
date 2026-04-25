import { Component, input, output, inject, signal, effect } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AnalysisService } from '../../../../core/services/analysis.service';
import type { RedlineContent, RedlineChange } from '../../../../core/models/deliverable.model';

export type RedlineMode = 'changes-only' | 'document-only' | 'full';

@Component({
  selector: 'app-redline',
  templateUrl: './redline.component.html',
})
export class RedlineComponent {
  content = input.required<RedlineContent>();
  deliverableId = input.required<string>();
  mode = input<RedlineMode>('full');

  deliverableUpdated = output<void>();

  private sanitizer = inject(DomSanitizer);
  private anaService = inject(AnalysisService);

  processing = signal<string | null>(null);
  localChanges = signal<RedlineChange[]>([]);

  constructor() {
    effect(() => {
      this.localChanges.set(this.content().changes ?? []);
    });
  }

  get safeHtml(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.content().baseHtml ?? '');
  }

  allChanges() {
    return this.localChanges();
  }

  pendingChanges() {
    return this.localChanges().filter(c => c.status === 'pending');
  }

  acceptedChanges() {
    return this.localChanges().filter(c => c.status === 'accepted');
  }

  rejectedChanges() {
    return this.localChanges().filter(c => c.status === 'rejected');
  }

  accept(change: RedlineChange) {
    this.processing.set(change.id);
    this.anaService.acceptRedlineChange(this.deliverableId(), change.id).subscribe({
      next: () => {
        this.localChanges.update(list =>
          list.map(c => c.id === change.id ? { ...c, status: 'accepted' as const } : c)
        );
        this.processing.set(null);
        this.deliverableUpdated.emit();
      },
      error: () => this.processing.set(null),
    });
  }

  reject(change: RedlineChange) {
    this.processing.set(change.id);
    this.anaService.rejectRedlineChange(this.deliverableId(), change.id).subscribe({
      next: () => {
        this.localChanges.update(list =>
          list.map(c => c.id === change.id ? { ...c, status: 'rejected' as const } : c)
        );
        this.processing.set(null);
        this.deliverableUpdated.emit();
      },
      error: () => this.processing.set(null),
    });
  }

  acceptAll() {
    this.anaService.acceptAllRedlineChanges(this.deliverableId()).subscribe({
      next: () => {
        this.localChanges.update(list =>
          list.map(c => c.status === 'pending' ? { ...c, status: 'accepted' as const } : c)
        );
        this.deliverableUpdated.emit();
      },
    });
  }

  rejectAll() {
    if (!confirm('Refuser toutes les modifications en attente ?')) return;
    this.anaService.rejectAllRedlineChanges(this.deliverableId()).subscribe({
      next: () => {
        this.localChanges.update(list =>
          list.map(c => c.status === 'pending' ? { ...c, status: 'rejected' as const } : c)
        );
        this.deliverableUpdated.emit();
      },
    });
  }

  changeTypeLabel(type: string) {
    return { replacement: 'Remplacement', insertion: 'Insertion', deletion: 'Suppression' }[type] ?? type;
  }

  changeTypeColor(type: string) {
    return { replacement: 'bg-orange-100 text-orange-700', insertion: 'bg-green-100 text-green-700', deletion: 'bg-red-100 text-red-700' }[type] ?? 'bg-gray-100 text-gray-600';
  }
}
