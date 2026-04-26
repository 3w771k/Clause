import {
  Component, ElementRef, Input, OnChanges, OnDestroy,
  SimpleChanges, ViewChild, signal,
} from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';

// Le worker est copié dans le dossier de sortie via angular.json (assets).
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.mjs';

@Component({
  selector: 'app-pdf-viewer',
  imports: [],
  template: `
    <div class="flex flex-col h-full overflow-hidden">
      <!-- Toolbar -->
      <div class="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0 gap-3">
        <div class="flex items-center gap-2">
          <button (click)="prevPage()" [disabled]="currentPage() <= 1"
            class="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <svg class="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
            </svg>
          </button>
          <span class="text-xs text-gray-600 tabular-nums">{{ currentPage() }} / {{ totalPages() }}</span>
          <button (click)="nextPage()" [disabled]="currentPage() >= totalPages()"
            class="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <svg class="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
            </svg>
          </button>
        </div>
        <div class="flex items-center gap-2">
          <button (click)="zoomOut()" class="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <svg class="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6"/>
            </svg>
          </button>
          <span class="text-xs text-gray-500 tabular-nums w-10 text-center">{{ (scale() * 100).toFixed(0) }}%</span>
          <button (click)="zoomIn()" class="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <svg class="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Canvas area -->
      <div class="flex-1 overflow-auto bg-gray-200 flex justify-center py-4">
        @if (loading()) {
          <div class="flex items-center justify-center w-full">
            <svg class="w-6 h-6 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        } @else if (error()) {
          <div class="flex items-center justify-center w-full text-sm text-gray-500">{{ error() }}</div>
        } @else {
          <canvas #pdfCanvas class="shadow-lg bg-white"></canvas>
        }
      </div>
    </div>
  `,
})
export class PdfViewerComponent implements OnChanges, OnDestroy {
  @Input() fileUrl: string | null = null;
  @Input() targetPage: number | null = null;
  @ViewChild('pdfCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  currentPage = signal(1);
  totalPages = signal(0);
  scale = signal(1.2);
  loading = signal(false);
  error = signal<string | null>(null);

  private pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  private renderTask: pdfjsLib.RenderTask | null = null;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['fileUrl'] && this.fileUrl) {
      this.loadPdf(this.fileUrl);
    }
    if (changes['targetPage'] && this.targetPage && this.pdfDoc) {
      this.goToPage(this.targetPage);
    }
  }

  ngOnDestroy() {
    this.pdfDoc?.destroy();
  }

  private async loadPdf(url: string) {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.pdfDoc?.destroy();
      this.pdfDoc = await pdfjsLib.getDocument(url).promise;
      this.totalPages.set(this.pdfDoc.numPages);
      this.currentPage.set(1);
      await this.renderPage(1);
    } catch {
      this.error.set('PDF non disponible — ce document a été importé sans fichier source.');
    } finally {
      this.loading.set(false);
    }
  }

  private async renderPage(pageNum: number) {
    if (!this.pdfDoc || !this.canvasRef) return;
    this.renderTask?.cancel();

    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: this.scale() });
    const canvas = this.canvasRef.nativeElement;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    this.renderTask = page.render({
      canvasContext: canvas.getContext('2d')!,
      viewport,
    });
    await this.renderTask.promise;
  }

  async goToPage(n: number) {
    const page = Math.max(1, Math.min(n, this.totalPages()));
    this.currentPage.set(page);
    await this.renderPage(page);
  }

  prevPage() { this.goToPage(this.currentPage() - 1); }
  nextPage() { this.goToPage(this.currentPage() + 1); }

  zoomIn() { this.scale.update(s => Math.min(s + 0.2, 3)); this.renderPage(this.currentPage()); }
  zoomOut() { this.scale.update(s => Math.max(s - 0.2, 0.5)); this.renderPage(this.currentPage()); }
}
