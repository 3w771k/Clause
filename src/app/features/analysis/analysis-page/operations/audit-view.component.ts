import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { ReviewNoteComponent } from '../../deliverables/review-note/review-note.component';
import { RedlineComponent } from '../../deliverables/redline/redline.component';
import { AppTabsComponent, TabDef } from '../../../shared/app-tabs.component';
import type { Deliverable, ReviewNoteContent, RedlineContent } from '../../../../core/models/deliverable.model';

@Component({
  selector: 'app-audit-view',
  standalone: true,
  imports: [AppTabsComponent, ReviewNoteComponent, RedlineComponent],
  host: { class: 'flex-1 flex flex-col overflow-hidden min-h-0 min-w-0' },
  template: `
    <app-tabs [tabs]="tabs" [activeId]="activeTab()" (tabChange)="activeTab.set($any($event))" />
    <div class="flex-1 overflow-y-auto p-5 min-h-0">
      <div class="max-w-4xl mx-auto">
        @if (activeTab() === 'review') {
          @if (reviewDeliverable(); as rev) {
            <div class="flex items-center justify-between mb-3">
              <div class="text-sm font-medium text-gray-700">{{ rev.name }}</div>
              <button (click)="refine.emit(rev.id)" class="btn-secondary">Affiner</button>
            </div>
            <app-review-note [content]="asReview(rev)" [deliverableId]="rev.id" />
          } @else {
            <p class="text-sm text-gray-400 text-center py-8">Note de revue non disponible.</p>
          }
        } @else if (activeTab() === 'redline') {
          @if (redlineDeliverable(); as red) {
            <app-redline [content]="asRedline(red)" [deliverableId]="red.id"
              (deliverableUpdated)="deliverableUpdated.emit(red.id)" />
          } @else {
            <p class="text-sm text-gray-400 text-center py-8">Redline non disponible.</p>
          }
        }
      </div>
    </div>
  `,
})
export class AuditViewComponent {
  @Input({ required: true }) deliverables: Deliverable[] = [];
  @Output() deliverableUpdated = new EventEmitter<string>();
  @Output() refine = new EventEmitter<string>();

  activeTab = signal<'review' | 'redline'>('review');

  tabs: TabDef[] = [
    { id: 'review', label: 'Note de revue' },
    { id: 'redline', label: 'Redline' },
  ];

  reviewDeliverable() { return this.deliverables.find(d => d.type === 'review_note') ?? null; }
  redlineDeliverable() { return this.deliverables.find(d => d.type === 'redline') ?? null; }

  asReview(d: Deliverable) { return d.content as ReviewNoteContent; }
  asRedline(d: Deliverable) { return d.content as RedlineContent; }
}
