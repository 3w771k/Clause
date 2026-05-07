import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { DDSynthesisComponent } from '../../deliverables/dd-synthesis/dd-synthesis.component';
import { DDTableComponent } from '../../deliverables/dd-table/dd-table.component';
import { AppTabsComponent, TabDef } from '../../../shared/app-tabs.component';
import type { Deliverable, DDSynthesisContent, DDTableContent } from '../../../../core/models/deliverable.model';

@Component({
  selector: 'app-dd-view',
  standalone: true,
  imports: [AppTabsComponent, DDSynthesisComponent, DDTableComponent],
  host: { class: 'flex-1 flex flex-col overflow-hidden min-h-0 min-w-0' },
  template: `
      <app-tabs [tabs]="tabs" [activeId]="activeTab()" (tabChange)="activeTab.set($any($event))" />
      <div class="flex-1 overflow-y-auto p-5 min-h-0">
        <div class="max-w-4xl mx-auto">
          @if (activeTab() === 'synthesis') {
            @if (synthesisDeliverable(); as synthDel) {
              <app-dd-synthesis [content]="asSynthesis(synthDel)" />
            } @else {
              <p class="text-sm text-gray-400 text-center py-8">Synthèse DD non disponible.</p>
            }
          } @else if (activeTab() === 'table') {
            @if (tableDeliverable(); as tableDel) {
              <app-dd-table [content]="asTable(tableDel)" />
            } @else {
              <p class="text-sm text-gray-400 text-center py-8">Tableau DD non disponible.</p>
            }
          }
        </div>
      </div>
  `,
})
export class DdViewComponent {
  @Input({ required: true }) deliverables: Deliverable[] = [];
  @Output() deliverableUpdated = new EventEmitter<string>();

  activeTab = signal<'synthesis' | 'table'>('synthesis');

  tabs: TabDef[] = [
    { id: 'synthesis', label: 'Synthèse' },
    { id: 'table', label: 'Tableau de risques' },
  ];

  synthesisDeliverable() { return this.deliverables.find(d => d.type === 'dd_synthesis') ?? null; }
  tableDeliverable() { return this.deliverables.find(d => d.type === 'dd_table') ?? null; }

  asSynthesis(d: Deliverable) { return d.content as DDSynthesisContent; }
  asTable(d: Deliverable) { return d.content as DDTableContent; }
}
