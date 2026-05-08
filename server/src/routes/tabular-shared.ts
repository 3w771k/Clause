import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/index.js';
import { tabularReviews, tabularRows, tabularCells, documents, legalObjects, clauses } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type ExtractionStrategy = 'llm_only' | 'attribute_first' | 'clause_filtered_llm';
export type ExtractionMode = 'attribute' | 'clause_llm' | 'doc_llm' | 'absent';

export interface TabularColumn {
  id: string;
  label: string;
  question: string;
  expectedType: string;
  // Brief E — extraction hybride par colonne
  extractionStrategy?: ExtractionStrategy;  // défaut llm_only (rétro-compat)
  clauseTypeOntologyId?: string;             // type de clause à filtrer
  attributePath?: string;                     // chemin pointé dans attributesJson (ex: "cap_amount" ou "duration.months")
}

interface ClauseLite {
  id: string;
  type: string;
  heading: string | null;
  text: string;
  attributes: Record<string, unknown>;
  citation: { page?: number | null };
}

export const ALLOWED_TYPES = new Set(['text', 'number', 'date', 'enum', 'boolean']);

export function parseColumns(raw: string): TabularColumn[] {
  try { return JSON.parse(raw); } catch { return []; }
}

export function cellId() { return `tc_${uuidv4().replace(/-/g, '').substring(0, 12)}`; }

export function sanitizeText(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  return s.replace(/<[^>]*>/g, '').slice(0, max).trim();
}

// Charge les clauses d'un legal_object en mémoire (utile pour attribute_first / clause_filtered_llm)
export async function loadClausesForLegalObject(legalObjectId: string): Promise<ClauseLite[]> {
  const rows = await db.select({
    id: clauses.id, type: clauses.type, heading: clauses.heading,
    text: clauses.text, attributesJson: clauses.attributesJson, citationJson: clauses.citationJson,
  })
    .from(clauses)
    .where(eq(clauses.legalObjectId, legalObjectId))
    .orderBy(clauses.clauseOrder);
  return rows.map(r => {
    let attributes: Record<string, unknown> = {};
    let citation: { page?: number | null } = {};
    try { attributes = JSON.parse(r.attributesJson); } catch { /* ignore */ }
    try { citation = JSON.parse(r.citationJson); } catch { /* ignore */ }
    return { id: r.id, type: r.type, heading: r.heading, text: r.text, attributes, citation };
  });
}

// Lecture déterministe d'un attribut via path (dot notation : "cap.amount" ou "duration_months")
function readAttribute(attributes: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = attributes;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

export async function extractCellValue(
  docText: string,
  column: TabularColumn,
  ctx?: { legalObjectId?: string },
): Promise<{ value: string | null; rawValue: string | null; confidence: string; citationJson: string; extractionMode: ExtractionMode }> {
  const strategy = column.extractionStrategy ?? 'llm_only';

  // Stratégie attribute_first : lookup déterministe sans LLM
  if (strategy === 'attribute_first' && ctx?.legalObjectId && column.clauseTypeOntologyId && column.attributePath) {
    const clauseList = await loadClausesForLegalObject(ctx.legalObjectId);
    const matching = clauseList.filter(c => c.type === column.clauseTypeOntologyId);
    for (const c of matching) {
      const attr = readAttribute(c.attributes, column.attributePath);
      if (attr !== undefined && attr !== null && attr !== '') {
        const value = formatValue(attr);
        return {
          value,
          rawValue: c.text.substring(0, 500),
          confidence: 'high',
          citationJson: JSON.stringify({ page: c.citation?.page ?? null, excerpt: c.text.substring(0, 500), clauseId: c.id }),
          extractionMode: 'attribute',
        };
      }
    }
    // Fallback : pas d'attribut trouvé, on passe en clause_filtered_llm si on a au moins le type
    if (matching.length > 0) {
      return await extractViaLlm(matching.map(c => c.text).join('\n\n'), column, 'clause_llm');
    }
    // Sinon fallback total LLM sur le doc
    return await extractViaLlm(docText, column, 'doc_llm');
  }

  // Stratégie clause_filtered_llm : LLM uniquement sur les clauses du bon type
  if (strategy === 'clause_filtered_llm' && ctx?.legalObjectId && column.clauseTypeOntologyId) {
    const clauseList = await loadClausesForLegalObject(ctx.legalObjectId);
    const matching = clauseList.filter(c => c.type === column.clauseTypeOntologyId);
    if (matching.length > 0) {
      return await extractViaLlm(matching.map(c => c.text).join('\n\n'), column, 'clause_llm');
    }
    return await extractViaLlm(docText, column, 'doc_llm');
  }

  // Défaut : LLM sur le doc entier (comportement legacy)
  return await extractViaLlm(docText, column, 'doc_llm');
}

async function extractViaLlm(
  text: string,
  column: TabularColumn,
  mode: ExtractionMode,
): Promise<{ value: string | null; rawValue: string | null; confidence: string; citationJson: string; extractionMode: ExtractionMode }> {
  const scopeLabel = mode === 'clause_llm' ? 'des clauses ciblées' : 'du document';
  const prompt = `Tu es analyste juridique. Réponds à la question posée en te basant UNIQUEMENT sur ${scopeLabel} ci-dessous.

RÈGLES DE LANGUE — IMPÉRATIF :
1. Détecte la langue du texte fourni (français / anglais / autre).
2. Ta réponse "value" doit être STRICTEMENT dans cette langue. NE PAS traduire.
3. "rawValue" = extrait VERBATIM du texte, en langue d'origine, sans modification.
4. La question peut être bilingue (séparée par " / ") — c'est juste pour t'aider.

Question : ${column.question}

Texte source :
<source>
${text.substring(0, 10000)}
</source>

Retourne UN objet JSON :
{
  "value": "réponse concise (1-3 phrases max) dans la langue source, ou null si absent",
  "rawValue": "extrait verbatim, ou null",
  "confidence": "high" | "medium" | "low" | "absent",
  "page": numéro de page si identifiable, ou null
}

Retourne UNIQUEMENT le JSON, pas de wrapper, pas de markdown.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const llmText = msg.content.find(b => b.type === 'text')?.text ?? '{}';
    const jsonMatch = llmText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no json');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      value: parsed.value ?? null,
      rawValue: parsed.rawValue ?? null,
      confidence: parsed.confidence ?? 'absent',
      citationJson: JSON.stringify({ page: parsed.page ?? null, excerpt: parsed.rawValue ?? null }),
      extractionMode: mode,
    };
  } catch {
    return { value: null, rawValue: null, confidence: 'absent', citationJson: '{}', extractionMode: mode };
  }
}

export async function loadFullReview(analysisId: string, trId: string) {
  const [review] = await db.select().from(tabularReviews)
    .where(and(eq(tabularReviews.id, trId), eq(tabularReviews.analysisId, analysisId)));
  if (!review) return null;
  const rowsRaw = await db.select({ row: tabularRows, fileName: documents.fileName })
    .from(tabularRows)
    .leftJoin(documents, eq(documents.id, tabularRows.documentId))
    .where(eq(tabularRows.tabularReviewId, trId));
  const cells = await db.select().from(tabularCells).where(eq(tabularCells.tabularReviewId, trId));
  return {
    ...review,
    columns: parseColumns(review.columnsJson),
    rows: rowsRaw.map(({ row: r, fileName }) => ({
      ...r,
      fileName: fileName ?? r.documentId,
      cells: cells
        .filter(c => c.rowId === r.id)
        .map(c => ({ ...c, citation: c.citationJson ? JSON.parse(c.citationJson) : null })),
    })),
  };
}

export async function rerunColumnCells(trId: string, col: TabularColumn) {
  const rows = await db.select({
    row: tabularRows,
    extractedText: documents.extractedText,
  })
    .from(tabularRows)
    .innerJoin(documents, eq(documents.id, tabularRows.documentId))
    .where(eq(tabularRows.tabularReviewId, trId));

  const now = new Date().toISOString();
  for (const { row, extractedText } of rows) {
    const extracted = await extractCellValue(extractedText || '', col, { legalObjectId: row.legalObjectId ?? undefined });
    const [existing] = await db.select().from(tabularCells)
      .where(and(
        eq(tabularCells.tabularReviewId, trId),
        eq(tabularCells.rowId, row.id),
        eq(tabularCells.columnId, col.id),
      ));
    if (existing) {
      await db.update(tabularCells).set({
        value: extracted.value,
        rawValue: extracted.rawValue,
        confidence: extracted.confidence,
        citationJson: extracted.citationJson,
        status: 'fresh',
        lastRunAt: now,
        isUserEdited: false,
        extractionMode: extracted.extractionMode,
      }).where(eq(tabularCells.id, existing.id));
    } else {
      await db.insert(tabularCells).values({
        id: cellId(),
        tabularReviewId: trId,
        rowId: row.id,
        columnId: col.id,
        columnLabel: col.label,
        value: extracted.value,
        rawValue: extracted.rawValue,
        confidence: extracted.confidence,
        citationJson: extracted.citationJson,
        status: 'fresh',
        lastRunAt: now,
        extractionMode: extracted.extractionMode,
      });
    }
  }
}
