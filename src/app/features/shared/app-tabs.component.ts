import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface TabDef {
  id: string;
  label: string;
  count?: number;
  iconPath?: string;
}

@Component({
  selector: 'app-tabs',
  standalone: true,
  template: `
    <div class="flex items-center gap-6 h-10 px-5 border-b border-gray-200 overflow-x-auto"
         [class.shrink-0]="!noShrink">
      @for (t of tabs; track t.id) {
        <button (click)="select(t.id)"
          [class.text-gray-500]="t.id !== activeId"
          [class.hover:text-gray-800]="t.id !== activeId"
          [class.text-gray-900]="t.id === activeId"
          [class.font-medium]="t.id === activeId"
          [class.border-gray-900]="t.id === activeId"
          [class.border-b-2]="t.id === activeId"
          [class.-mb-px]="t.id === activeId"
          class="text-sm py-2 transition-colors whitespace-nowrap inline-flex items-center gap-1.5">
          @if (t.iconPath) {
            <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="t.iconPath"/>
            </svg>
          }
          <span>{{ t.label }}</span>
          @if (t.count !== undefined) {
            <span class="text-xs text-gray-400 ml-0.5">{{ t.count }}</span>
          }
        </button>
      }
    </div>
  `,
})
export class AppTabsComponent {
  @Input({ required: true }) tabs: TabDef[] = [];
  @Input({ required: true }) activeId = '';
  @Input() noShrink = false;
  @Output() tabChange = new EventEmitter<string>();

  select(id: string) {
    if (id !== this.activeId) this.tabChange.emit(id);
  }
}
