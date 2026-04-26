import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  real,
  blob,
} from 'drizzle-orm/sqlite-core';

// ─── Workspaces ───────────────────────────────────────────────────────────────

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  createdBy: text('created_by').notNull().default('demo-user'),
  activeOntologyId: text('active_ontology_id').notNull().default('maison'),
});

// ─── Documents ────────────────────────────────────────────────────────────────

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull().default('application/pdf'),
  sizeBytes: integer('size_bytes').notNull().default(0),
  uploadedAt: text('uploaded_at').notNull().default(sql`(datetime('now'))`),
  uploadedBy: text('uploaded_by').notNull().default('demo-user'),
  extractedText: text('extracted_text').notNull().default(''),
  conversionMode: text('conversion_mode').notNull().default('standard'),
  language: text('language').default('fr'),
  // Legal extraction status
  legalExtractionStatus: text('legal_extraction_status').notNull().default('none'),
  legalObjectId: text('legal_object_id'),
  lastExtractionAt: text('last_extraction_at'),
  extractionError: text('extraction_error'),
  fileBlob: blob('file_blob', { mode: 'buffer' }),
});

export const textPassages = sqliteTable('text_passages', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  page: integer('page').notNull().default(1),
  paragraph: integer('paragraph').notNull().default(1),
  text: text('text').notNull(),
  startOffset: integer('start_offset').notNull().default(0),
  endOffset: integer('end_offset').notNull().default(0),
});

// ─── Legal Objects ────────────────────────────────────────────────────────────

export const legalObjects = sqliteTable('legal_objects', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  ontologyId: text('ontology_id').notNull().default('maison'),
  extractedAt: text('extracted_at').notNull().default(sql`(datetime('now'))`),
  extractionVersion: integer('extraction_version').notNull().default(1),
  documentType: text('document_type').notNull().default('CONTRAT'),
  documentSubtype: text('document_subtype'),
  language: text('language').notNull().default('fr'),
  overallConfidence: text('overall_confidence').notNull().default('high'),
  metadataJson: text('metadata_json').notNull().default('{}'),
  userEditsJson: text('user_edits_json').notNull().default('[]'),
});

export const clauses = sqliteTable('clauses', {
  id: text('id').primaryKey(),
  legalObjectId: text('legal_object_id').notNull().references(() => legalObjects.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  heading: text('heading'),
  sequenceNumber: text('sequence_number'),
  clauseOrder: integer('clause_order').notNull().default(0),
  text: text('text').notNull(),
  citationJson: text('citation_json').notNull().default('{}'),
  attributesJson: text('attributes_json').notNull().default('{}'),
  confidence: text('confidence').notNull().default('high'),
  isUserAdded: integer('is_user_added', { mode: 'boolean' }).notNull().default(false),
  isUserModified: integer('is_user_modified', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
  linkedDefinedTerms: text('linked_defined_terms').notNull().default('[]'),
  linkedClauses: text('linked_clauses').notNull().default('[]'),
});

export const definedTerms = sqliteTable('defined_terms', {
  id: text('id').primaryKey(),
  legalObjectId: text('legal_object_id').notNull().references(() => legalObjects.id, { onDelete: 'cascade' }),
  term: text('term').notNull(),
  definition: text('definition').notNull(),
  citationJson: text('citation_json').notNull().default('{}'),
  confidence: text('confidence').notNull().default('high'),
  referencedInClauses: text('referenced_in_clauses').notNull().default('[]'),
});

export const crossReferences = sqliteTable('cross_references', {
  id: text('id').primaryKey(),
  legalObjectId: text('legal_object_id').notNull().references(() => legalObjects.id, { onDelete: 'cascade' }),
  sourceClauseId: text('source_clause_id').notNull(),
  targetClauseId: text('target_clause_id'),
  targetAnnex: text('target_annex'),
  rawText: text('raw_text').notNull(),
  citationJson: text('citation_json').notNull().default('{}'),
});

export const clauseEmbeddings = sqliteTable('clause_embeddings', {
  clauseId: text('clause_id').primaryKey().references(() => clauses.id, { onDelete: 'cascade' }),
  vector: blob('vector', { mode: 'buffer' }).notNull(),
  model: text('model').notNull().default('multilingual-e5-small'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── Analyses ─────────────────────────────────────────────────────────────────

export const analyses = sqliteTable('analyses', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  createdBy: text('created_by').notNull().default('demo-user'),
  lastActivityAt: text('last_activity_at').notNull().default(sql`(datetime('now'))`),
  status: text('status').notNull().default('active'),
  operation: text('operation').notNull().default('unclear'),
  referenceAssetId: text('reference_asset_id'),
});

export const analysisDocuments = sqliteTable('analysis_documents', {
  id: text('id').primaryKey(),
  analysisId: text('analysis_id').notNull().references(() => analyses.id, { onDelete: 'cascade' }),
  legalObjectId: text('legal_object_id').notNull().references(() => legalObjects.id),
  role: text('role').notNull().default('target'),
  addedAt: text('added_at').notNull().default(sql`(datetime('now'))`),
  addedBy: text('added_by').notNull().default('demo-user'),
  orderInAnalysis: integer('order_in_analysis').notNull().default(0),
});

// ─── Deliverables ─────────────────────────────────────────────────────────────

export const deliverables = sqliteTable('deliverables', {
  id: text('id').primaryKey(),
  analysisId: text('analysis_id').notNull().references(() => analyses.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  createdBy: text('created_by').notNull().default('ai'),
  currentVersion: integer('current_version').notNull().default(1),
  status: text('status').notNull().default('draft'),
  contentJson: text('content_json').notNull().default('{}'),
  sourceDocumentIds: text('source_document_ids').notNull().default('[]'),
  referenceAssetIds: text('reference_asset_ids').notNull().default('[]'),
  sourceOperation: text('source_operation').notNull().default('alignment'),
  sourcePromptSnapshot: text('source_prompt_snapshot'),
  publishedAssetId: text('published_asset_id'),
});

export const deliverableVersions = sqliteTable('deliverable_versions', {
  id: text('id').primaryKey(),
  deliverableId: text('deliverable_id').notNull().references(() => deliverables.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  createdBy: text('created_by').notNull().default('ai'),
  summary: text('summary').notNull().default(''),
  contentJson: text('content_json').notNull().default('{}'),
});

// ─── Reference Base ───────────────────────────────────────────────────────────

export const referenceAssets = sqliteTable('reference_assets', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  createdBy: text('created_by').notNull().default('demo-user'),
  lastUpdatedAt: text('last_updated_at').notNull().default(sql`(datetime('now'))`),
  lastUpdatedBy: text('last_updated_by').notNull().default('demo-user'),
  ontologyId: text('ontology_id').notNull().default('maison'),
  jurisdiction: text('jurisdiction'),
  language: text('language').notNull().default('fr'),
  currentVersion: integer('current_version').notNull().default(1),
  governanceStatus: text('governance_status').notNull().default('validated'),
  tags: text('tags').notNull().default('[]'),
  contentJson: text('content_json').notNull().default('{}'),
});

export const referenceAssetVersions = sqliteTable('reference_asset_versions', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull().references(() => referenceAssets.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  createdBy: text('created_by').notNull().default('demo-user'),
  summary: text('summary').notNull().default(''),
  contentJson: text('content_json').notNull().default('{}'),
});
