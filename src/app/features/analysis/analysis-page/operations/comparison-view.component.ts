import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { ComparativeNoteComponent } from '../../deliverables/comparative-note/comparative-note.component';
import { RedlineComponent } from '../../deliverables/redline/redline.component';
import { AppTabsComponent, TabDef } from '../../../shared/app-tabs.component';
import type { Deliverable, ComparativeNoteContent, RedlineContent } from '../../../../core/models/deliverable.model';

@Component({
  selector: 'app-comparison-view',
  standalone: true,
  imports: [AppTabsComponent, ComparativeNoteComponent, RedlineComponent],
  host: { class: 'flex-1 flex flex-col overflow-hidden min-h-0 min-w-0' },
  template: `
      <app-tabs [tabs]="tabs" [activeId]="activeTab()" (tabChange)="activeTab.set($any($event))" />
      <div class="flex-1 overflow-y-auto p-5 min-h-0">
        <div class="max-w-4xl mx-auto">
          @if (activeTab() === 'note') {
            @if (noteDeliverable(); as noteDel) {
              <div class="flex items-center justify-between mb-3">
                <div class="text-sm font-medium text-gray-700">{{ noteDel.name }}</div>
                <button (click)="refine.emit(noteDel.id)" class="btn-secondary">Affiner</button>
              </div>
              <app-comparative-note [content]="asNote(noteDel)" />
            } @else if (isGenerating) {
              <div class="flex flex-col items-center justify-center py-16 text-center">
                <svg class="w-8 h-8 text-gray-400 animate-spin mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
                </svg>
                <p class="text-sm font-medium text-gray-700">Comparaison en cours…</p>
                <p class="text-xs text-gray-500 mt-1">Note comparative + redline générés par le LLM (1–2 minutes).</p>
              </div>
            } @else {
              <p class="text-sm text-gray-400 text-center py-8">Note comparative non disponible.</p>
            }
          } @else if (activeTab() === 'redline') {
            @if (redlineDeliverable(); as redlineDel) {
              <app-redline
                [content]="asRedline(redlineDel)"
                [deliverableId]="redlineDel.id"
                [mode]="'changes-only'"
                (deliverableUpdated)="deliverableUpdated.emit(redlineDel.id)" />
            } @else if (isGenerating) {
              <div class="flex flex-col items-center justify-center py-16 text-center">
                <svg class="w-8 h-8 text-gray-400 animate-spin mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
                </svg>
                <p class="text-sm font-medium text-gray-700">Génération du redline…</p>
              </div>
            } @else {
              <p class="text-sm text-gray-400 text-center py-8">Redline non disponible.</p>
            }
          } @else if (activeTab() === 'document') {
            @if (redlineDeliverable(); as redlineDel) {
              <app-redline
                [content]="asRedline(redlineDel)"
                [deliverableId]="redlineDel.id"
                [mode]="'document-only'"
                (deliverableUpdated)="deliverableUpdated.emit(redlineDel.id)" />
            } @else if (isGenerating) {
              <div class="flex flex-col items-center justify-center py-16 text-center">
                <svg class="w-8 h-8 text-gray-400 animate-spin mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
                </svg>
                <p class="text-sm font-medium text-gray-700">Génération en cours…</p>
              </div>
            } @else {
              <p class="text-sm text-gray-400 text-center py-8">Document non disponible.</p>
            }
          }
        </div>
      </div>
  `,
})
export class ComparisonViewComponent {
  @Input({ required: true }) deliverables: Deliverable[] = [];
  @Input() isGenerating = false;
  @Output() deliverableUpdated = new EventEmitter<string>();
  @Output() refine = new EventEmitter<string>();

  activeTab = signal<'note' | 'redline' | 'document'>('note');

  tabs: TabDef[] = [
    { id: 'note', label: 'Note comparative' },
    { id: 'redline', label: 'Redline par clause' },
    { id: 'document', label: 'Document complet' },
  ];

  noteDeliverable() { return this.deliverables.find(d => d.type === 'comparative_note') ?? null; }
  redlineDeliverable() { return this.deliverables.find(d => d.type === 'redline') ?? null; }

  asNote(d: Deliverable) { return d.content as ComparativeNoteContent; }
  asRedline(d: Deliverable) { return d.content as RedlineContent; }
}
