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
          } @else if (isGenerating) {
            <div class="flex flex-col items-center justify-center py-16 text-center">
              <svg class="w-8 h-8 text-gray-400 animate-spin mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
              </svg>
              <p class="text-sm font-medium text-gray-700">Audit en cours…</p>
              <p class="text-xs text-gray-500 mt-1">Analyse du contrat vs playbook par le LLM (1–2 minutes).</p>
            </div>
          } @else {
            <p class="text-sm text-gray-400 text-center py-8">Note de revue non disponible.</p>
          }
        } @else if (activeTab() === 'redline') {
          @if (redlineDeliverable(); as red) {
            <app-redline [content]="asRedline(red)" [deliverableId]="red.id"
              (deliverableUpdated)="deliverableUpdated.emit(red.id)" />
          } @else if (isGenerating) {
            <div class="flex flex-col items-center justify-center py-16 text-center">
              <svg class="w-8 h-8 text-gray-400 animate-spin mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
              </svg>
              <p class="text-sm font-medium text-gray-700">Génération du redline d'audit…</p>
              <p class="text-xs text-gray-500 mt-1">Le redline ancré sur le playbook arrive après la note de revue.</p>
            </div>
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
  @Input() isGenerating = false;
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
