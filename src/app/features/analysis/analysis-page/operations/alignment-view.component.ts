import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { ComparativeNoteComponent } from '../../deliverables/comparative-note/comparative-note.component';
import { RedlineComponent } from '../../deliverables/redline/redline.component';
import { AppTabsComponent, TabDef } from '../../../shared/app-tabs.component';
import type { Deliverable, ComparativeNoteContent, RedlineContent } from '../../../../core/models/deliverable.model';

@Component({
  selector: 'app-alignment-view',
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
            } @else {
              <p class="text-sm text-gray-400 text-center py-8">Document non disponible.</p>
            }
          }
        </div>
      </div>
  `,
})
export class AlignmentViewComponent {
  @Input({ required: true }) deliverables: Deliverable[] = [];
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
