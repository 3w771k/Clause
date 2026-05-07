import { Component, Input } from '@angular/core';
import { TabularReviewComponent } from '../../deliverables/tabular-review/tabular-review.component';

@Component({
  selector: 'app-tabular-view',
  standalone: true,
  imports: [TabularReviewComponent],
  host: { class: 'flex-1 flex overflow-hidden min-h-0 min-w-0' },
  template: `<app-tabular-review [anaId]="anaId" [wsId]="wsId" />`,
})
export class TabularViewComponent {
  @Input({ required: true }) anaId = '';
  @Input({ required: true }) wsId = '';
}
