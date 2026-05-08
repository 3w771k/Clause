import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import {
  tabularReviews, tabularRows, tabularCells,
  analyses, analysisDocuments, documents, legalObjects,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import {
  TabularColumn, parseColumns, cellId, extractCellValue,
} from './tabular-shared.js';

export const tabularReviewsRouter = Router({ mergeParams: true });

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

  const rowsRaw = await db.select({
    row: tabularRows,
    fileName: documents.fileName,
  })
  .from(tabularRows)
  .leftJoin(documents, eq(documents.id, tabularRows.documentId))
  .where(eq(tabularRows.tabularReviewId, trId));

  const cells = await db.select().from(tabularCells).where(eq(tabularCells.tabularReviewId, trId));

  res.json({
    ...review,
    columns: parseColumns(review.columnsJson),
    analysis: review.analysisJson ? JSON.parse(review.analysisJson) : null,
    rows: rowsRaw.map(({ row: r, fileName }) => ({
      ...r,
      fileName: fileName ?? r.documentId,
      cells: cells
        .filter(c => c.rowId === r.id)
        .map(c => ({ ...c, citation: c.citationJson ? JSON.parse(c.citationJson) : null })),
    })),
  });
});

// DELETE /:trId/rows/:rowId — supprime la ligne (cascade sur les cells)
// Ne touche pas à l'entrée analysis_documents : le doc peut servir ailleurs.
tabularReviewsRouter.delete('/:trId/rows/:rowId', async (req, res) => {
  const { analysisId, trId, rowId } = req.params;
  const [review] = await db.select().from(tabularReviews)
    .where(and(eq(tabularReviews.id, trId), eq(tabularReviews.analysisId, analysisId)));
  if (!review) return res.status(404).json({ error: 'Tabular review not found' });

  await db.delete(tabularRows).where(
    and(eq(tabularRows.tabularReviewId, trId), eq(tabularRows.id, rowId)),
  );
  res.status(204).send();
});

// POST /:trId/rows — ajoute UN doc à la review (auto-add à l'analyse si manquant) + extraction immédiate
tabularReviewsRouter.post('/:trId/rows', async (req, res) => {
  const { analysisId, trId } = req.params;
  const { legalObjectId } = req.body as { legalObjectId: string };
  if (!legalObjectId) return res.status(400).json({ error: 'legalObjectId requis' });

  const [review] = await db.select().from(tabularReviews)
    .where(and(eq(tabularReviews.id, trId), eq(tabularReviews.analysisId, analysisId)));
  if (!review) return res.status(404).json({ error: 'Tabular review not found' });

  const [lo] = await db.select().from(legalObjects).where(eq(legalObjects.id, legalObjectId));
  if (!lo) return res.status(404).json({ error: 'Legal object not found' });

  // Lien analysis_documents : ajout si manquant
  const adRows = await db.select().from(analysisDocuments)
    .where(and(eq(analysisDocuments.analysisId, analysisId), eq(analysisDocuments.legalObjectId, legalObjectId)));
  if (!adRows.length) {
    await db.insert(analysisDocuments).values({
      id: `ad_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
      analysisId,
      legalObjectId,
      role: 'target',
      addedAt: new Date().toISOString(),
      orderInAnalysis: 0,
    });
  }

  // Évite doublon de row dans la review
  const existingRow = await db.select().from(tabularRows)
    .where(and(eq(tabularRows.tabularReviewId, trId), eq(tabularRows.documentId, lo.documentId)));
  if (existingRow.length) {
    return res.status(409).json({ error: 'Document déjà présent dans le tableau' });
  }

  const [doc] = await db.select().from(documents).where(eq(documents.id, lo.documentId));
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });

  // Compte des rows actuels pour orderInReview
  const rowCount = await db.select().from(tabularRows).where(eq(tabularRows.tabularReviewId, trId));
  const rowId = `trow_${uuidv4().replace(/-/g, '').substring(0, 10)}`;
  const [newRow] = await db.insert(tabularRows).values({
    id: rowId,
    tabularReviewId: trId,
    documentId: doc.id,
    legalObjectId: lo.id,
    orderInReview: rowCount.length,
  }).returning();

  // Extraction de toutes les colonnes pour cette ligne uniquement
  const columns = parseColumns(review.columnsJson);
  const docText = doc.extractedText ?? '';
  const now = new Date().toISOString();
  const cells = [];
  for (const col of columns) {
    const extracted = await extractCellValue(docText, col, { legalObjectId: lo.id });
    const [inserted] = await db.insert(tabularCells).values({
      id: cellId(),
      tabularReviewId: trId,
      rowId,
      columnId: col.id,
      columnLabel: col.label,
      value: extracted.value,
      rawValue: extracted.rawValue,
      confidence: extracted.confidence,
      citationJson: extracted.citationJson,
      extractionMode: extracted.extractionMode,
      status: 'fresh',
      lastRunAt: now,
    }).returning();
    cells.push(inserted);
  }

  res.status(201).json({
    row: { ...newRow, fileName: doc.fileName, cells },
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
      const extracted = await extractCellValue(docText, col, { legalObjectId: doc.legalObjectId ?? undefined });

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
          status: 'fresh',
          lastRunAt: now,
          isUserEdited: false,
          extractionMode: extracted.extractionMode,
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
          status: 'fresh',
          lastRunAt: now,
          extractionMode: extracted.extractionMode,
        }).returning();
        cellResults.push(inserted);
      }
    }

    results.push({ row: existingRow, cells: cellResults, documentName: doc.fileName });
  }

  await db.update(tabularReviews).set({ lastRunAt: now }).where(eq(tabularReviews.id, trId));

  res.json({ trId, runAt: now, rowsProcessed: results.length, results });
});

// POST /:trId/rows/:rowId/cells/:colId/rerun — single cell re-run
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

  const extracted = await extractCellValue(doc.extractedText || '', col, { legalObjectId: row.legalObjectId ?? undefined });
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
      status: 'fresh',
      lastRunAt: now,
      isUserEdited: false,
      extractionMode: extracted.extractionMode,
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
      status: 'fresh',
      lastRunAt: now,
      extractionMode: extracted.extractionMode,
    }).returning();
  }

  res.json(cell);
});

// PATCH /:trId/rows/:rowId/cells/:colId — manual edit
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

// ─── Brief E — Preview des types de clauses + attributs disponibles dans l'analyse ─
import { clauses as clausesTable, analysisDocuments as adTable } from '../db/schema.js';

tabularReviewsRouter.get('/:trId/clause-types', async (req, res) => {
  const { analysisId } = req.params;
  // Tous les legalObjectIds des docs de l'analyse
  const ads = await db.select({ legalObjectId: adTable.legalObjectId })
    .from(adTable).where(eq(adTable.analysisId, analysisId));
  if (!ads.length) return res.json({ types: [] });

  const summary = new Map<string, { count: number; attributeKeys: Set<string>; sample: string }>();
  for (const ad of ads) {
    const cl = await db.select({ type: clausesTable.type, text: clausesTable.text, attrs: clausesTable.attributesJson })
      .from(clausesTable).where(eq(clausesTable.legalObjectId, ad.legalObjectId));
    for (const c of cl) {
      let entry = summary.get(c.type);
      if (!entry) {
        entry = { count: 0, attributeKeys: new Set(), sample: c.text.substring(0, 200) };
        summary.set(c.type, entry);
      }
      entry.count++;
      try {
        const a = JSON.parse(c.attrs) as Record<string, unknown>;
        for (const k of Object.keys(a)) entry.attributeKeys.add(k);
      } catch { /* ignore */ }
    }
  }
  res.json({
    types: Array.from(summary.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([type, v]) => ({
        type,
        occurrences: v.count,
        attributeKeys: Array.from(v.attributeKeys),
        sampleText: v.sample,
      })),
  });
});

// ─── Tabular Analysis (Brief A) ───────────────────────────────────────────────

import {
  runTabularAnalysis, getTabularAnalysis, setReviewPlaybook,
  listCustomChecks, addCustomCheck, deleteCustomCheck,
} from '../services/tabular-analysis.service.js';

// POST /:trId/analyze — exécute l'analyse cohérence (cross-row + verdicts + synthèse)
tabularReviewsRouter.post('/:trId/analyze', async (req, res) => {
  const { analysisId, trId } = req.params;
  const [review] = await db.select().from(tabularReviews)
    .where(and(eq(tabularReviews.id, trId), eq(tabularReviews.analysisId, analysisId)));
  if (!review) return res.status(404).json({ error: 'Tabular review not found' });

  try {
    const result = await runTabularAnalysis(trId);
    if (!result) return res.status(500).json({ error: 'Analysis failed' });
    res.json(result);
  } catch (err) {
    console.error('[tabular-analyze] error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Analysis failed' });
  }
});

// GET /:trId/analysis — retrouve la dernière analyse cachée
tabularReviewsRouter.get('/:trId/analysis', async (req, res) => {
  const { analysisId, trId } = req.params;
  const [review] = await db.select().from(tabularReviews)
    .where(and(eq(tabularReviews.id, trId), eq(tabularReviews.analysisId, analysisId)));
  if (!review) return res.status(404).json({ error: 'Tabular review not found' });
  const analysis = await getTabularAnalysis(trId);
  res.json(analysis ?? null);
});

// GET /:trId/custom-checks — liste les règles custom de cohérence
tabularReviewsRouter.get('/:trId/custom-checks', async (req, res) => {
  const { trId } = req.params;
  res.json(await listCustomChecks(trId));
});

// POST /:trId/custom-checks — ajoute une règle custom
tabularReviewsRouter.post('/:trId/custom-checks', async (req, res) => {
  const { trId } = req.params;
  const { prompt } = req.body as { prompt: string };
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt requis' });
  const check = await addCustomCheck(trId, prompt);
  res.status(201).json(check);
});

// DELETE /:trId/custom-checks/:checkId
tabularReviewsRouter.delete('/:trId/custom-checks/:checkId', async (req, res) => {
  const { trId, checkId } = req.params;
  await deleteCustomCheck(trId, checkId);
  res.status(204).send();
});

// PATCH /:trId/playbook — attache/détache un playbook à la review
tabularReviewsRouter.patch('/:trId/playbook', async (req, res) => {
  const { analysisId, trId } = req.params;
  const { playbookAssetId } = req.body as { playbookAssetId: string | null };
  const [review] = await db.select().from(tabularReviews)
    .where(and(eq(tabularReviews.id, trId), eq(tabularReviews.analysisId, analysisId)));
  if (!review) return res.status(404).json({ error: 'Tabular review not found' });
  await setReviewPlaybook(trId, playbookAssetId);
  res.json({ playbookAssetId });
});

// POST /:trId/query — NL→SQL chat
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
    generatedSql = generatedSql.replace(/^```sql?\n?/i, '').replace(/\n?```$/, '').trim();

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
