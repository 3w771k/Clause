import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import {
  tabularReviews, tabularRows, tabularCells,
  analyses, analysisDocuments, documents, legalObjects,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

export const tabularReviewsRouter = Router({ mergeParams: true });

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface TabularColumn {
  id: string;
  label: string;
  question: string;
  expectedType: string;
}

function parseColumns(raw: string): TabularColumn[] {
  try { return JSON.parse(raw); } catch { return []; }
}

function cellId() { return `tc_${uuidv4().replace(/-/g, '').substring(0, 12)}`; }

async function extractCellValue(
  docText: string,
  column: TabularColumn,
): Promise<{ value: string | null; rawValue: string | null; confidence: string; citationJson: string }> {
  const prompt = `You are a legal analyst. Answer the following question based solely on the document text below.

Question: ${column.question}

Document:
<document>
${docText.substring(0, 10000)}
</document>

Return a JSON object with:
- "value": concise answer (1-3 sentences max), or null if absent
- "rawValue": verbatim excerpt from the document that supports your answer, or null
- "confidence": "high" | "medium" | "low" | "absent"
- "page": page number if identifiable, or null

Return only valid JSON.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content.find(b => b.type === 'text')?.text ?? '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no json');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      value: parsed.value ?? null,
      rawValue: parsed.rawValue ?? null,
      confidence: parsed.confidence ?? 'absent',
      citationJson: JSON.stringify({ page: parsed.page ?? null, excerpt: parsed.rawValue ?? null }),
    };
  } catch {
    return { value: null, rawValue: null, confidence: 'absent', citationJson: '{}' };
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

// GET /api/analyses/:analysisId/tabular-reviews
tabularReviewsRouter.get('/', async (req, res) => {
  const { analysisId } = req.params;
  const rows = await db.select().from(tabularReviews).where(eq(tabularReviews.analysisId, analysisId));
  res.json(rows.map(r => ({ ...r, columns: parseColumns(r.columnsJson) })));
});

// POST /api/analyses/:analysisId/tabular-reviews
tabularReviewsRouter.post('/', async (req, res) => {
  const { analysisId } = req.params;
  const { name, workflowId, columns, isCustom } = req.body as {
    name: string;
    workflowId?: string;
    columns?: TabularColumn[];
    isCustom?: boolean;
  };

  const [analysis] = await db.select().from(analyses).where(eq(analyses.id, analysisId));
  if (!analysis) return res.status(404).json({ error: 'Analysis not found' });

  const id = `tr_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  const cols: TabularColumn[] = (columns ?? []).map((c, i) => ({
    id: c.id || `col_${i}`,
    label: c.label,
    question: c.question,
    expectedType: c.expectedType ?? 'text',
  }));

  const [row] = await db.insert(tabularReviews).values({
    id,
    analysisId,
    name,
    workflowId: workflowId ?? undefined,
    isCustom: isCustom ?? !workflowId,
    columnsJson: JSON.stringify(cols),
  }).returning();

  res.status(201).json({ ...row, columns: cols });
});

// GET /api/analyses/:analysisId/tabular-reviews/:trId
tabularReviewsRouter.get('/:trId', async (req, res) => {
  const { analysisId, trId } = req.params;
  const [review] = await db.select().from(tabularReviews)
    .where(and(eq(tabularReviews.id, trId), eq(tabularReviews.analysisId, analysisId)));
  if (!review) return res.status(404).json({ error: 'Tabular review not found' });

  const rows = await db.select().from(tabularRows).where(eq(tabularRows.tabularReviewId, trId));
  const cells = await db.select().from(tabularCells).where(eq(tabularCells.tabularReviewId, trId));

  res.json({
    ...review,
    columns: parseColumns(review.columnsJson),
    rows: rows.map(r => ({
      ...r,
      cells: cells
        .filter(c => c.rowId === r.id)
        .map(c => ({ ...c, citation: c.citationJson ? JSON.parse(c.citationJson) : null })),
    })),
  });
});

// POST /api/analyses/:analysisId/tabular-reviews/:trId/run — run all cells
tabularReviewsRouter.post('/:trId/run', async (req, res) => {
  const { analysisId, trId } = req.params;

  const [review] = await db.select().from(tabularReviews)
    .where(and(eq(tabularReviews.id, trId), eq(tabularReviews.analysisId, analysisId)));
  if (!review) return res.status(404).json({ error: 'Tabular review not found' });

  const columns = parseColumns(review.columnsJson);
  if (!columns.length) return res.status(400).json({ error: 'No columns defined' });

  // Get all documents in the analysis
  const adRows = await db.select({
    legalObjectId: analysisDocuments.legalObjectId,
    documentId: legalObjects.documentId,
    fileName: documents.fileName,
    extractedText: documents.extractedText,
  })
  .from(analysisDocuments)
  .innerJoin(legalObjects, eq(legalObjects.id, analysisDocuments.legalObjectId))
  .innerJoin(documents, eq(documents.id, legalObjects.documentId))
  .where(eq(analysisDocuments.analysisId, analysisId));

  if (!adRows.length) return res.status(400).json({ error: 'No documents in analysis' });

  const now = new Date().toISOString();
  const results = [];

  for (const doc of adRows) {
    // Upsert row
    let [existingRow] = await db.select().from(tabularRows)
      .where(and(eq(tabularRows.tabularReviewId, trId), eq(tabularRows.documentId, doc.documentId)));

    if (!existingRow) {
      const rowId = `trow_${uuidv4().replace(/-/g, '').substring(0, 10)}`;
      [existingRow] = await db.insert(tabularRows).values({
        id: rowId,
        tabularReviewId: trId,
        documentId: doc.documentId,
        legalObjectId: doc.legalObjectId,
        orderInReview: results.length,
      }).returning();
    }

    const docText = doc.extractedText || '';
    const cellResults = [];

    for (const col of columns) {
      const extracted = await extractCellValue(docText, col);

      // Upsert cell
      const [existingCell] = await db.select().from(tabularCells)
        .where(and(
          eq(tabularCells.tabularReviewId, trId),
          eq(tabularCells.rowId, existingRow.id),
          eq(tabularCells.columnId, col.id),
        ));

      if (existingCell) {
        const [updated] = await db.update(tabularCells).set({
          value: extracted.value,
          rawValue: extracted.rawValue,
          confidence: extracted.confidence,
          citationJson: extracted.citationJson,
          lastRunAt: now,
          isUserEdited: false,
        }).where(eq(tabularCells.id, existingCell.id)).returning();
        cellResults.push(updated);
      } else {
        const [inserted] = await db.insert(tabularCells).values({
          id: cellId(),
          tabularReviewId: trId,
          rowId: existingRow.id,
          columnId: col.id,
          columnLabel: col.label,
          value: extracted.value,
          rawValue: extracted.rawValue,
          confidence: extracted.confidence,
          citationJson: extracted.citationJson,
          lastRunAt: now,
        }).returning();
        cellResults.push(inserted);
      }
    }

    results.push({ row: existingRow, cells: cellResults, documentName: doc.fileName });
  }

  await db.update(tabularReviews).set({ lastRunAt: now }).where(eq(tabularReviews.id, trId));

  res.json({ trId, runAt: now, rowsProcessed: results.length, results });
});

// POST /api/analyses/:analysisId/tabular-reviews/:trId/rows/:rowId/cells/:colId/rerun
tabularReviewsRouter.post('/:trId/rows/:rowId/cells/:colId/rerun', async (req, res) => {
  const { analysisId, trId, rowId, colId } = req.params;

  const [review] = await db.select().from(tabularReviews)
    .where(and(eq(tabularReviews.id, trId), eq(tabularReviews.analysisId, analysisId)));
  if (!review) return res.status(404).json({ error: 'Tabular review not found' });

  const columns = parseColumns(review.columnsJson);
  const col = columns.find(c => c.id === colId);
  if (!col) return res.status(404).json({ error: 'Column not found' });

  const [row] = await db.select().from(tabularRows).where(eq(tabularRows.id, rowId));
  if (!row) return res.status(404).json({ error: 'Row not found' });

  const [doc] = await db.select().from(documents).where(eq(documents.id, row.documentId));
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const extracted = await extractCellValue(doc.extractedText || '', col);
  const now = new Date().toISOString();

  const [existingCell] = await db.select().from(tabularCells)
    .where(and(
      eq(tabularCells.tabularReviewId, trId),
      eq(tabularCells.rowId, rowId),
      eq(tabularCells.columnId, colId),
    ));

  let cell;
  if (existingCell) {
    [cell] = await db.update(tabularCells).set({
      value: extracted.value,
      rawValue: extracted.rawValue,
      confidence: extracted.confidence,
      citationJson: extracted.citationJson,
      lastRunAt: now,
      isUserEdited: false,
    }).where(eq(tabularCells.id, existingCell.id)).returning();
  } else {
    [cell] = await db.insert(tabularCells).values({
      id: cellId(),
      tabularReviewId: trId,
      rowId,
      columnId: colId,
      columnLabel: col.label,
      value: extracted.value,
      rawValue: extracted.rawValue,
      confidence: extracted.confidence,
      citationJson: extracted.citationJson,
      lastRunAt: now,
    }).returning();
  }

  res.json(cell);
});

// PATCH /api/analyses/:analysisId/tabular-reviews/:trId/rows/:rowId/cells/:colId — manual edit
tabularReviewsRouter.patch('/:trId/rows/:rowId/cells/:colId', async (req, res) => {
  const { trId, rowId, colId } = req.params;
  const { value, rawValue } = req.body as { value: string; rawValue?: string };

  const [existingCell] = await db.select().from(tabularCells)
    .where(and(
      eq(tabularCells.tabularReviewId, trId),
      eq(tabularCells.rowId, rowId),
      eq(tabularCells.columnId, colId),
    ));
  if (!existingCell) return res.status(404).json({ error: 'Cell not found' });

  const [updated] = await db.update(tabularCells).set({
    value,
    rawValue: rawValue ?? existingCell.rawValue,
    isUserEdited: true,
    confidence: 'high',
  }).where(eq(tabularCells.id, existingCell.id)).returning();

  res.json(updated);
});

// POST /api/analyses/:analysisId/tabular-reviews/:trId/query — NL→SQL chat
tabularReviewsRouter.post('/:trId/query', async (req, res) => {
  const { trId, analysisId } = req.params;
  const { question } = req.body as { question: string };

  if (!question?.trim()) return res.status(400).json({ error: 'question is required' });

  const [review] = await db.select().from(tabularReviews)
    .where(and(eq(tabularReviews.id, trId), eq(tabularReviews.analysisId, analysisId)));
  if (!review) return res.status(404).json({ error: 'Tabular review not found' });

  const schemaHint = `
Table: tabular_cells
Columns: id, tabular_review_id, row_id, column_id, column_label, value, value_type, raw_value, citation_json, confidence, is_user_edited, last_run_at

Table: tabular_rows
Columns: id, tabular_review_id, document_id, legal_object_id, order_in_review

Table: documents
Columns: id, file_name, language

The tabular_review_id for this review is '${trId}'.
`;

  const sqlPrompt = `You are a SQL expert. Given the schema below, translate the user's natural language question into a valid SQLite SELECT query.

Schema:
${schemaHint}

User question: ${question}

Return ONLY the SQL query, nothing else. Always include a JOIN with documents via tabular_rows to show file_name.`;

  let generatedSql = '';
  let queryResult: Record<string, unknown>[] = [];
  let error: string | undefined;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: sqlPrompt }],
    });
    generatedSql = (msg.content.find(b => b.type === 'text')?.text ?? '').trim();
    // Strip markdown code fences if present
    generatedSql = generatedSql.replace(/^```sql?\n?/i, '').replace(/\n?```$/, '').trim();

    // Safety: only allow SELECT
    if (!generatedSql.toUpperCase().startsWith('SELECT')) {
      throw new Error('Only SELECT queries are allowed');
    }

    const { sqlite } = await import('../db/index.js');
    const stmt = sqlite.prepare(generatedSql);
    queryResult = stmt.all() as Record<string, unknown>[];
  } catch (err) {
    error = err instanceof Error ? err.message : 'Query execution failed';
    queryResult = [];
  }

  res.json({ question, generatedSql, result: queryResult, error: error ?? null });
});
