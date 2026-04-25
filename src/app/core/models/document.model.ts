export type ExtractionStatus = 'none' | 'processing' | 'done' | 'error';

export interface Document {
  id: string;
  workspaceId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  extractedText: string;
  language: string | null;
  legalExtractionStatus: ExtractionStatus;
  legalObjectId: string | null;
  lastExtractionAt: string | null;
  extractionError: string | null;
  hasFile?: boolean;
}

export interface TextPassage {
  id: string;
  documentId: string;
  page: number;
  paragraph: number;
  text: string;
  startOffset: number;
  endOffset: number;
}
