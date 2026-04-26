export interface Citation {
  documentId?: string;
  passageIds?: string[];
  page?: number;
  extract?: string;
}

export interface Clause {
  id: string;
  legalObjectId: string;
  type: string;
  heading: string | null;
  sequenceNumber: string | null;
  clauseOrder: number;
  text: string;
  citation: Citation;
  attributes: Record<string, unknown>;
  confidence: 'high' | 'medium' | 'low';
  isUserAdded: boolean;
  isUserModified: boolean;
  notes: string | null;
  linkedDefinedTerms: string[];
  linkedClauses: string[];
}

export interface DefinedTerm {
  id: string;
  legalObjectId: string;
  term: string;
  definition: string;
  citation: Citation;
  confidence: 'high' | 'medium' | 'low';
  referencedInClauses: string[];
}

export interface CrossReference {
  id: string;
  legalObjectId: string;
  sourceClauseId: string;
  targetClauseId: string | null;
  targetAnnex: string | null;
  rawText: string;
  citation: Citation;
}

export interface LegalObject {
  id: string;
  documentId: string;
  ontologyId: string;
  extractedAt: string;
  documentType: string;
  documentSubtype: string | null;
  language: string;
  overallConfidence: string;
  metadata: Record<string, unknown>;
  clauses: Clause[];
  definedTerms: DefinedTerm[];
  crossReferences: CrossReference[];
}
