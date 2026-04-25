export interface Analysis {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  lastActivityAt: string;
  status: string;
  operation?: string;
  referenceAssetId?: string | null;
  documents?: AnalysisDocument[];
  deliverables?: DeliverableSummary[];
}

export interface AnalysisDocument {
  id: string;
  analysisId: string;
  legalObjectId: string;
  role: 'target' | 'reference';
  addedAt: string;
  orderInAnalysis: number;
  documentName?: string | null;
  documentType?: string;
  documentSubtype?: string | null;
}

export interface ConversationMessage {
  id: string;
  analysisId: string;
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;
  deliverableReferences: string[];
  citations: unknown[];
  interpretedIntent: unknown | null;
}

export interface DeliverableSummary {
  id: string;
  type: string;
  name: string;
  status: string;
  createdAt: string;
  sourceOperation: string;
}
