export type ViewType = 'tabular' | 'audit' | 'comparison' | 'contract_draft' | 'multi_doc_redline' | 'template_contract';

// Mapping legacy operation → viewType (Brief 7).
export function operationToViewType(op: string | null | undefined): ViewType {
  switch (op) {
    case 'alignment': return 'comparison';
    case 'confrontation': return 'audit';
    case 'tabular': return 'tabular';
    case 'template_contract': return 'template_contract';
    case 'dd':
    case 'ma_mapping':
    case 'deadlines':
    case 'compliance':
    case 'inconsistencies':
    case 'aggregation':
    case 'unclear':
    default:
      return 'tabular';
  }
}

export interface Analysis {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  lastActivityAt: string;
  status: string;
  viewType?: ViewType;
  legacyOperation?: string | null;
  /** @deprecated utiliser viewType. Conservé pour compat des anciens écrans. */
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

export interface DeliverableSummary {
  id: string;
  type: string;
  name: string;
  status: string;
  createdAt: string;
  sourceOperation: string;
}
