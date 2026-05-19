// Schémas typés des contents d'assets (Brief 6).
// Le ReferenceAsset porte content: PlaybookContent | StandardContent | ...
// L'union discriminée se fait via le champ `type` du ReferenceAsset, validée
// côté backend par Zod (server/src/schemas/asset-content.schema.ts).

export type AssetType =
  | 'playbook'
  | 'standard'
  | 'dd_grid'
  | 'clausier'
  | 'tabular_workflow';

export interface AmendableElement {
  id: string;
}

// ─── Playbook ─────────────────────────────────────────────────────────────────
// Format stocké : sections[] avec clauseType + stakes + positions (idéal/repli/red flag)

export interface PlaybookPosition {
  description: string;
}

export interface PlaybookSection {
  clauseType: string;
  stakes?: string;
  positions?: {
    ideal?: PlaybookPosition;
    fallback?: PlaybookPosition;
    redFlag?: PlaybookPosition;
  };
  sourceClauseIds?: string[];
}

export interface PlaybookContent {
  sections: PlaybookSection[];
  scope?: string;
  sourceDocumentName?: string;
}

// ─── Standard (template de contrat) ───────────────────────────────────────────

export interface StandardClause extends AmendableElement {
  clauseTypeOntologyId: string;
  text: string;
  variantsAllowed?: string[];
  notes?: string;
}

export interface StandardSection extends AmendableElement {
  heading: string;
  order: number;
  clauses: StandardClause[];
}

export interface StandardContent {
  schemaVersion: 1;
  documentType: string;
  sections: StandardSection[];
}

// ─── DD Grid ──────────────────────────────────────────────────────────────────

export interface DDQuestion extends AmendableElement {
  text: string;
  expectedAnswerType: 'text' | 'boolean' | 'number' | 'date';
  redFlagCriteria?: string;
}

export interface DDTheme extends AmendableElement {
  name: string;
  questions: DDQuestion[];
}

export interface DDGridContent {
  schemaVersion: 1;
  themes: DDTheme[];
}

// ─── Clausier ─────────────────────────────────────────────────────────────────

export interface ClausierVariant extends AmendableElement {
  label: string;
  text: string;
  context?: string;
  frequency?: number;
}

export interface ClausierAssetSection extends AmendableElement {
  clauseTypeOntologyId: string;
  title: string;
  description?: string;
  variants: ClausierVariant[];
}

export interface ClausierAssetContent {
  schemaVersion: 1;
  sections: ClausierAssetSection[];
}

// ─── Tabular Workflow ─────────────────────────────────────────────────────────

export interface TabularWorkflowColumn extends AmendableElement {
  label: string;
  question: string;
  expectedType: 'text' | 'number' | 'date' | 'boolean' | 'enum';
  enumValues?: string[];
  order: number;
}

export interface TabularWorkflowContent {
  schemaVersion: 1;
  applicableDocumentTypes: string[];
  columns: TabularWorkflowColumn[];
}

// ─── Union ────────────────────────────────────────────────────────────────────

export type AnyAssetContent =
  | PlaybookContent
  | StandardContent
  | DDGridContent
  | ClausierAssetContent
  | TabularWorkflowContent;

// Type guards (le content reste typé large car la base contient encore des
// vieux blobs tant que la migration n'est pas faite ; on type sur usage).
import type { ReferenceAsset } from './reference-asset.model';

export function isPlaybook(a: ReferenceAsset): boolean { return a.type === 'playbook'; }
export function isStandard(a: ReferenceAsset): boolean { return a.type === 'standard'; }
export function isDDGrid(a: ReferenceAsset): boolean { return a.type === 'dd_grid'; }
export function isClausierAsset(a: ReferenceAsset): boolean { return a.type === 'clausier'; }
export function isTabularWorkflow(a: ReferenceAsset): boolean { return a.type === 'tabular_workflow'; }

export function asPlaybook(a: ReferenceAsset): PlaybookContent {
  return (a.content ?? { sections: [] }) as unknown as PlaybookContent;
}
export function asStandard(a: ReferenceAsset): StandardContent | null {
  if (!isStandard(a)) return null;
  return a.content as unknown as StandardContent;
}
export function asDDGrid(a: ReferenceAsset): DDGridContent | null {
  if (!isDDGrid(a)) return null;
  return a.content as unknown as DDGridContent;
}
export function asClausierAsset(a: ReferenceAsset): ClausierAssetContent | null {
  if (!isClausierAsset(a)) return null;
  return a.content as unknown as ClausierAssetContent;
}
export function asTabularWorkflow(a: ReferenceAsset): TabularWorkflowContent | null {
  if (!isTabularWorkflow(a)) return null;
  return a.content as unknown as TabularWorkflowContent;
}
