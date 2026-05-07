import { Component, EventEmitter, Input, Output, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnalysisService } from '../../../core/services/analysis.service';

interface ChatMessage {
  id: string; role: string; content: string; timestamp: string;
  deliverableReferences: string[]; pending?: boolean;
}

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [FormsModule],
  host: { class: 'w-80 shrink-0 flex flex-col border-l border-gray-200 bg-white overflow-hidden' },
  template: `
      <div class="px-4 py-3 border-b border-gray-100 shrink-0 flex items-center justify-between">
        <span class="text-sm font-semibold text-gray-800">Conversation</span>
        <button (click)="close.emit()" class="text-gray-400 hover:text-gray-600">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        @if (messages().length === 0) {
          <div class="text-center py-6">
            <p class="text-xs text-gray-400 mb-3">Posez une question sur les documents de cette analyse.</p>
            <div class="space-y-1.5">
              @for (ex of examples; track ex) {
                <button (click)="chatInput.set(ex); send()"
                  class="block w-full text-left text-xs px-3 py-2 rounded-md bg-gray-50 hover:bg-gray-100 hover:text-gray-800 text-gray-600 transition-colors">
                  {{ ex }}
                </button>
              }
            </div>
          </div>
        }
        @for (msg of messages(); track msg.id) {
          <div [class]="msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
            <div [class]="msg.role === 'user'
              ? 'bg-gray-900 text-white rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%]'
              : 'bg-gray-100 text-gray-800 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%]'"
              class="text-xs leading-relaxed">
              @if (msg.pending) {
                <span class="text-gray-400 italic">Réflexion...</span>
              } @else {
                <span class="whitespace-pre-wrap">{{ msg.content }}</span>
              }
            </div>
          </div>
        }
      </div>
      <div class="p-3 border-t border-gray-100 shrink-0">
        <div class="flex gap-2">
          <input [ngModel]="chatInput()" (ngModelChange)="chatInput.set($event)"
            (keydown.enter)="send()"
            placeholder="Posez une question..."
            class="flex-1 px-2.5 py-2 text-xs rounded-md border border-gray-300 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900" />
          <button (click)="send()" [disabled]="!chatInput().trim() || sending()" class="btn-primary">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
            </svg>
          </button>
        </div>
      </div>
  `,
})
export class ChatPanelComponent implements OnInit, OnDestroy {
  @Input({ required: true }) wsId = '';
  @Input({ required: true }) anaId = '';
  @Output() close = new EventEmitter<void>();

  private svc = inject(AnalysisService);

  messages = signal<ChatMessage[]>([]);
  chatInput = signal('');
  sending = signal(false);
  readonly examples = [
    'Quels sont les risques principaux ?',
    'Compare la durée des deux contrats',
    'Y a-t-il des clauses d\'exclusivité ?',
  ];

  private pollHandle: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() { this.load(); }
  ngOnDestroy() { if (this.pollHandle) clearTimeout(this.pollHandle); }

  load() {
    this.svc.getMessages(this.wsId, this.anaId).subscribe(msgs => {
      this.messages.set(msgs);
      if (msgs.some(m => m.content === '⏳ Traitement en cours...')) this.poll();
    });
  }

  send() {
    const content = this.chatInput().trim();
    if (!content || this.sending()) return;
    this.sending.set(true);
    this.chatInput.set('');
    this.svc.sendMessage(this.wsId, this.anaId, content).subscribe({
      next: res => {
        this.messages.update(list => [
          ...list,
          { id: res.userMessageId, role: 'user', content, timestamp: new Date().toISOString(), deliverableReferences: [] },
          { ...res.assistantMessage, pending: true },
        ]);
        this.sending.set(false);
        this.poll();
      },
      error: () => this.sending.set(false),
    });
  }

  private poll() {
    if (this.pollHandle) clearTimeout(this.pollHandle);
    this.pollHandle = setTimeout(() => {
      this.svc.getMessages(this.wsId, this.anaId).subscribe(msgs => {
        this.messages.set(msgs.map(m => ({ ...m, pending: m.content === '⏳ Traitement en cours...' })));
        if (msgs.some(m => m.content === '⏳ Traitement en cours...')) this.poll();
      });
    }, 2000);
  }
}
