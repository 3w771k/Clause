import { Component, EventEmitter, Input, Output, signal, OnChanges, SimpleChanges } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { ComparativeNoteComponent } from '../../deliverables/comparative-note/comparative-note.component';
import { RedlineComponent } from '../../deliverables/redline/redline.component';
import { ReviewNoteComponent } from '../../deliverables/review-note/review-note.component';
import { ClausierComponent } from '../../deliverables/clausier/clausier.component';
import { DDSynthesisComponent } from '../../deliverables/dd-synthesis/dd-synthesis.component';
import { DDTableComponent } from '../../deliverables/dd-table/dd-table.component';
import { MaTableComponent } from '../../deliverables/ma-table/ma-table.component';
import { DeadlinesTableComponent } from '../../deliverables/deadlines-table/deadlines-table.component';
import { ComplianceNoteComponent } from '../../deliverables/compliance-note/compliance-note.component';
import { InconsistenciesReportComponent } from '../../deliverables/inconsistencies-report/inconsistencies-report.component';
import { AppTabsComponent, TabDef } from '../../../shared/app-tabs.component';
import type {
  Deliverable, ComparativeNoteContent, RedlineContent, ReviewNoteContent, ClausierContent,
  DDSynthesisContent, DDTableContent, MaTableContent, DeadlinesTableContent,
  ComplianceNoteContent, InconsistenciesReportContent,
} from '../../../../core/models/deliverable.model';

const PUBLISHABLE = new Set(['review_note', 'clausier', 'dd_synthesis', 'comparative_note']);

const TYPE_LABELS: Record<string, string> = {
  comparative_note: 'Note comparative',
  redline: 'Redline',
  review_note: 'Note de revue',
  clausier: 'Clausier',
  dd_synthesis: 'Synthèse DD',
  dd_table: 'Tableau DD',
  ma_table: 'Cartographie M&A',
  deadlines_table: 'Échéances',
  compliance_note: 'Audit conformité',
  inconsistencies_report: 'Incohérences',
};

@Component({
  selector: 'app-default-deliverable-view',
  standalone: true,
  imports: [JsonPipe, AppTabsComponent,
    ComparativeNoteComponent, RedlineComponent, ReviewNoteComponent, ClausierComponent,
    DDSynthesisComponent, DDTableComponent, MaTableComponent, DeadlinesTableComponent,
    ComplianceNoteComponent, InconsistenciesReportComponent],
  host: { class: 'flex-1 flex flex-col overflow-hidden min-h-0 min-w-0' },
  template: `
      @if (deliverables.length > 0) {
        <app-tabs [tabs]="tabs()" [activeId]="activeId()" (tabChange)="select($event)" />
      }
      <div class="flex-1 overflow-y-auto p-5 min-h-0">
        @if (active(); as del) {
          <div class="max-w-4xl mx-auto">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h2 class="font-semibold text-gray-900 text-sm">{{ del.name }}</h2>
                <div class="flex items-center gap-2 mt-1">
                  <span class="text-xs text-gray-400">v{{ del.currentVersion }}</span>
                  <span class="text-gray-300">·</span>
                  <span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{{ del.status }}</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button (click)="refine.emit(del.id)" class="btn-secondary">Affiner</button>
                @if (isPublishable(del.type)) {
                  <button (click)="publish.emit(del)" class="btn-primary">Publier</button>
                }
              </div>
            </div>

            @switch (del.type) {
              @case ('comparative_note') { <app-comparative-note [content]="asNote(del)" /> }
              @case ('redline') { <app-redline [content]="asRedline(del)" [deliverableId]="del.id" (deliverableUpdated)="deliverableUpdated.emit(del.id)" /> }
              @case ('review_note') { <app-review-note [content]="asReviewNote(del)" [deliverableId]="del.id" /> }
              @case ('clausier') { <app-clausier [content]="asClausier(del)" [deliverableId]="del.id" /> }
              @case ('dd_synthesis') { <app-dd-synthesis [content]="asDDSynth(del)" /> }
              @case ('dd_table') { <app-dd-table [content]="asDDTable(del)" /> }
              @case ('ma_table') { <app-ma-table [content]="asMa(del)" /> }
              @case ('deadlines_table') { <app-deadlines-table [content]="asDeadlines(del)" /> }
              @case ('compliance_note') { <app-compliance-note [content]="asCompliance(del)" /> }
              @case ('inconsistencies_report') { <app-inconsistencies-report [content]="asIncons(del)" /> }
              @default { <pre class="text-xs bg-white rounded-xl p-4 border border-gray-200 overflow-x-auto">{{ del.content | json }}</pre> }
            }
          </div>
        } @else if (isGenerating) {
          <div class="flex flex-col items-center justify-center h-full text-center">
            <svg class="w-8 h-8 text-gray-400 animate-spin mb-3" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <p class="text-sm text-gray-500">Génération en cours...</p>
            <p class="text-xs text-gray-400 mt-1">Les livrables apparaîtront ici dès qu'ils sont prêts.</p>
          </div>
        } @else {
          <div class="flex flex-col items-center justify-center h-full text-center">
            <p class="text-sm text-gray-400">Aucun livrable disponible</p>
          </div>
        }
      </div>
  `,
})
export class DefaultDeliverableViewComponent implements OnChanges {
  @Input({ required: true }) deliverables: Deliverable[] = [];
  @Input() isGenerating = false;
  @Output() deliverableUpdated = new EventEmitter<string>();
  @Output() refine = new EventEmitter<string>();
  @Output() publish = new EventEmitter<Deliverable>();

  activeId = signal<string>('');

  ngOnChanges(changes: SimpleChanges) {
    if (changes['deliverables']) {
      const cur = this.activeId();
      if (!cur || !this.deliverables.find(d => d.id === cur)) {
        this.activeId.set(this.deliverables[0]?.id ?? '');
      }
    }
  }

  tabs(): TabDef[] {
    return this.deliverables.map(d => ({ id: d.id, label: TYPE_LABELS[d.type] ?? d.type }));
  }

  active(): Deliverable | null {
    return this.deliverables.find(d => d.id === this.activeId()) ?? null;
  }

  select(id: string) { this.activeId.set(id); }

  isPublishable(type: string) { return PUBLISHABLE.has(type); }

  asNote(d: Deliverable) { return d.content as ComparativeNoteContent; }
  asRedline(d: Deliverable) { return d.content as RedlineContent; }
  asReviewNote(d: Deliverable) { return d.content as ReviewNoteContent; }
  asClausier(d: Deliverable) { return d.content as ClausierContent; }
  asDDSynth(d: Deliverable) { return d.content as DDSynthesisContent; }
  asDDTable(d: Deliverable) { return d.content as DDTableContent; }
  asMa(d: Deliverable) { return d.content as MaTableContent; }
  asDeadlines(d: Deliverable) { return d.content as DeadlinesTableContent; }
  asCompliance(d: Deliverable) { return d.content as ComplianceNoteContent; }
  asIncons(d: Deliverable) { return d.content as InconsistenciesReportContent; }
}
