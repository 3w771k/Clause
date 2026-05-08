import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/legal-extraction.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export function initDb() {
  // Create tables directly via SQL (simpler than migrations for pré-alpha)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT NOT NULL DEFAULT 'demo-user',
      active_ontology_id TEXT NOT NULL DEFAULT 'maison'
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/pdf',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      uploaded_by TEXT NOT NULL DEFAULT 'demo-user',
      extracted_text TEXT NOT NULL DEFAULT '',
      conversion_mode TEXT NOT NULL DEFAULT 'standard',
      language TEXT DEFAULT 'fr',
      legal_extraction_status TEXT NOT NULL DEFAULT 'none',
      legal_object_id TEXT,
      last_extraction_at TEXT,
      extraction_error TEXT
    );

    CREATE TABLE IF NOT EXISTS text_passages (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      page INTEGER NOT NULL DEFAULT 1,
      paragraph INTEGER NOT NULL DEFAULT 1,
      text TEXT NOT NULL,
      start_offset INTEGER NOT NULL DEFAULT 0,
      end_offset INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS legal_objects (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      ontology_id TEXT NOT NULL DEFAULT 'maison',
      extracted_at TEXT NOT NULL DEFAULT (datetime('now')),
      extraction_version INTEGER NOT NULL DEFAULT 1,
      document_type TEXT NOT NULL DEFAULT 'CONTRAT',
      document_subtype TEXT,
      language TEXT NOT NULL DEFAULT 'fr',
      overall_confidence TEXT NOT NULL DEFAULT 'high',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      user_edits_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS clauses (
      id TEXT PRIMARY KEY,
      legal_object_id TEXT NOT NULL REFERENCES legal_objects(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      heading TEXT,
      sequence_number TEXT,
      clause_order INTEGER NOT NULL DEFAULT 0,
      text TEXT NOT NULL,
      citation_json TEXT NOT NULL DEFAULT '{}',
      attributes_json TEXT NOT NULL DEFAULT '{}',
      confidence TEXT NOT NULL DEFAULT 'high',
      is_user_added INTEGER NOT NULL DEFAULT 0,
      is_user_modified INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      linked_defined_terms TEXT NOT NULL DEFAULT '[]',
      linked_clauses TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS defined_terms (
      id TEXT PRIMARY KEY,
      legal_object_id TEXT NOT NULL REFERENCES legal_objects(id) ON DELETE CASCADE,
      term TEXT NOT NULL,
      definition TEXT NOT NULL,
      citation_json TEXT NOT NULL DEFAULT '{}',
      confidence TEXT NOT NULL DEFAULT 'high',
      referenced_in_clauses TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS cross_references (
      id TEXT PRIMARY KEY,
      legal_object_id TEXT NOT NULL REFERENCES legal_objects(id) ON DELETE CASCADE,
      source_clause_id TEXT NOT NULL,
      target_clause_id TEXT,
      target_annex TEXT,
      raw_text TEXT NOT NULL,
      citation_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS clause_embeddings (
      clause_id TEXT PRIMARY KEY REFERENCES clauses(id) ON DELETE CASCADE,
      vector BLOB NOT NULL,
      model TEXT NOT NULL DEFAULT 'multilingual-e5-small',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT NOT NULL DEFAULT 'demo-user',
      last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS analysis_documents (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
      legal_object_id TEXT NOT NULL REFERENCES legal_objects(id),
      role TEXT NOT NULL DEFAULT 'target',
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      added_by TEXT NOT NULL DEFAULT 'demo-user',
      order_in_analysis INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS deliverables (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT NOT NULL DEFAULT 'ai',
      current_version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft',
      content_json TEXT NOT NULL DEFAULT '{}',
      source_document_ids TEXT NOT NULL DEFAULT '[]',
      reference_asset_ids TEXT NOT NULL DEFAULT '[]',
      source_operation TEXT NOT NULL DEFAULT 'alignment',
      source_prompt_snapshot TEXT,
      published_asset_id TEXT
    );

    CREATE TABLE IF NOT EXISTS deliverable_versions (
      id TEXT PRIMARY KEY,
      deliverable_id TEXT NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT NOT NULL DEFAULT 'ai',
      summary TEXT NOT NULL DEFAULT '',
      content_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS reference_assets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT NOT NULL DEFAULT 'demo-user',
      last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated_by TEXT NOT NULL DEFAULT 'demo-user',
      ontology_id TEXT NOT NULL DEFAULT 'maison',
      jurisdiction TEXT,
      language TEXT NOT NULL DEFAULT 'fr',
      current_version INTEGER NOT NULL DEFAULT 1,
      governance_status TEXT NOT NULL DEFAULT 'validated',
      tags TEXT NOT NULL DEFAULT '[]',
      content_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS reference_asset_versions (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES reference_assets(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT NOT NULL DEFAULT 'demo-user',
      summary TEXT NOT NULL DEFAULT '',
      content_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS amendments (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES reference_assets(id) ON DELETE CASCADE,
      proposed_at TEXT NOT NULL DEFAULT (datetime('now')),
      proposed_by TEXT NOT NULL DEFAULT 'demo-user',
      proposed_from_analysis_id TEXT REFERENCES analyses(id),
      scope TEXT NOT NULL DEFAULT 'other',
      target_path TEXT NOT NULL DEFAULT '',
      current_value TEXT NOT NULL DEFAULT '',
      proposed_value TEXT NOT NULL DEFAULT '',
      rationale TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TEXT,
      reviewed_by TEXT,
      reviewer_comment TEXT,
      trigger_source TEXT NOT NULL DEFAULT 'manual',
      trigger_redline_id TEXT
    );

    CREATE TABLE IF NOT EXISTS tabular_reviews (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      workflow_id TEXT,
      is_custom INTEGER NOT NULL DEFAULT 0,
      columns_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT NOT NULL DEFAULT 'demo-user',
      last_run_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tabular_rows (
      id TEXT PRIMARY KEY,
      tabular_review_id TEXT NOT NULL REFERENCES tabular_reviews(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      legal_object_id TEXT REFERENCES legal_objects(id),
      order_in_review INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tabular_cells (
      id TEXT PRIMARY KEY,
      tabular_review_id TEXT NOT NULL REFERENCES tabular_reviews(id) ON DELETE CASCADE,
      row_id TEXT NOT NULL REFERENCES tabular_rows(id) ON DELETE CASCADE,
      column_id TEXT NOT NULL,
      column_label TEXT NOT NULL DEFAULT '',
      value TEXT,
      value_type TEXT DEFAULT 'text',
      raw_value TEXT,
      citation_json TEXT,
      confidence TEXT NOT NULL DEFAULT 'absent',
      is_user_edited INTEGER NOT NULL DEFAULT 0,
      last_run_at TEXT
    );

    CREATE TABLE IF NOT EXISTS redlines (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
      source_document_id TEXT NOT NULL REFERENCES documents(id),
      source_legal_object_id TEXT REFERENCES legal_objects(id),
      produced_by TEXT NOT NULL DEFAULT 'audit',
      produced_from_id TEXT NOT NULL,
      base_text_snapshot TEXT NOT NULL DEFAULT '',
      proposals_json TEXT NOT NULL DEFAULT '[]',
      comments_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT NOT NULL DEFAULT 'ai',
      status TEXT NOT NULL DEFAULT 'draft'
    );

    CREATE TABLE IF NOT EXISTS contract_drafts (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
      template_standard_id TEXT NOT NULL REFERENCES reference_assets(id),
      variables_json TEXT NOT NULL DEFAULT '{}',
      output_redline_id TEXT REFERENCES redlines(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS multi_doc_redlines (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
      target_document_ids TEXT NOT NULL DEFAULT '[]',
      decision TEXT NOT NULL,
      decision_structured_json TEXT,
      per_document_redlines_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// Safe column additions for existing databases
try { sqlite.exec(`ALTER TABLE documents ADD COLUMN file_blob BLOB`); } catch {}
try { sqlite.exec(`ALTER TABLE analyses ADD COLUMN operation TEXT NOT NULL DEFAULT 'unclear'`); } catch {}
try { sqlite.exec(`ALTER TABLE analyses ADD COLUMN reference_asset_id TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE tabular_cells ADD COLUMN status TEXT NOT NULL DEFAULT 'fresh'`); } catch {}
try { sqlite.exec(`ALTER TABLE amendments ADD COLUMN target_element_id TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE amendments ADD COLUMN target_element_path TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE analyses ADD COLUMN view_type TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE tabular_reviews ADD COLUMN analysis_json TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE tabular_reviews ADD COLUMN last_analysis_at TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE tabular_reviews ADD COLUMN playbook_asset_id TEXT`); } catch {}

export { sqlite };
