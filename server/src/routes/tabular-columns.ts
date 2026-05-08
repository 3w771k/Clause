import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { tabularReviews, tabularRows, tabularCells } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import {
  TabularColumn, ALLOWED_TYPES,
  parseColumns, cellId, sanitizeText,
  loadFullReview, rerunColumnCells,
} from './tabular-shared.js';

export const tabularColumnsRouter = Router({ mergeParams: true });

// PATCH /:trId/columns/:colId — edit column
tabularColumnsRouter.patch('/:trId/columns/:colId', async (req, res) => {
  const { analysisId, trId, colId } = req.params;
  const rerun = req.query.rerun === 'true' || req.query.rerun === '1';
  const { label, question, expectedType, extractionStrategy, clauseTypeOntologyId, attributePath } = req.body as {
    label?: string; question?: string; expectedType?: string;
    extractionStrategy?: string; clauseTypeOntologyId?: string | null; attributePath?: string | null;
  };

  const [review] = await db.select().from(tabularReviews)
    .where(and(eq(tabularReviews.id, trId), eq(tabularReviews.analysisId, analysisId)));
  if (!review) return res.status(404).json({ error: 'Tabular review not found' });

  const columns = parseColumns(review.columnsJson);
  const idx = columns.findIndex(c => c.id === colId);
  if (idx < 0) return res.status(404).json({ error: 'Column not found' });

  const prev = columns[idx];
  const next = { ...prev };
  let questionChanged = false, typeChanged = false, labelChanged = false;

  if (label !== undefined) {
    const v = sanitizeText(label, 200);
    if (!v) return res.status(400).json({ error: 'label invalide' });
    if (v !== prev.label) { next.label = v; labelChanged = true; }
  }
  if (question !== undefined) {
    const v = sanitizeText(question, 2000);
    if (!v) return res.status(400).json({ error: 'question invalide' });
    if (v !== prev.question) { next.question = v; questionChanged = true; }
  }
  if (expectedType !== undefined) {
    if (!ALLOWED_TYPES.has(expectedType)) return res.status(400).json({ error: 'expectedType invalide' });
    if (expectedType !== prev.expectedType) { next.expectedType = expectedType; typeChanged = true; }
  }
  // Brief E — extraction hybride
  const ALLOWED_STRATEGIES = new Set(['llm_only', 'attribute_first', 'clause_filtered_llm']);
  if (extractionStrategy !== undefined) {
    if (!ALLOWED_STRATEGIES.has(extractionStrategy)) return res.status(400).json({ error: 'extractionStrategy invalide' });
    if (extractionStrategy !== prev.extractionStrategy) { next.extractionStrategy = extractionStrategy as TabularColumn['extractionStrategy']; questionChanged = true; }
  }
  if (clauseTypeOntologyId !== undefined) {
    const v = clauseTypeOntologyId === null || clauseTypeOntologyId === '' ? undefined : String(clauseTypeOntologyId).slice(0, 200);
    if (v !== prev.clauseTypeOntologyId) { next.clauseTypeOntologyId = v; questionChanged = true; }
  }
  if (attributePath !== undefined) {
    const v = attributePath === null || attributePath === '' ? undefined : String(attributePath).slice(0, 200);
    if (v !== prev.attributePath) { next.attributePath = v; questionChanged = true; }
  }

  columns[idx] = next;
  await db.update(tabularReviews)
    .set({ columnsJson: JSON.stringify(columns) })
    .where(eq(tabularReviews.id, trId));

  if (labelChanged) {
    await db.update(tabularCells)
      .set({ columnLabel: next.label })
      .where(and(eq(tabularCells.tabularReviewId, trId), eq(tabularCells.columnId, colId)));
  }
  if (questionChanged) {
    await db.update(tabularCells)
      .set({ status: 'pending' })
      .where(and(eq(tabularCells.tabularReviewId, trId), eq(tabularCells.columnId, colId)));
  } else if (typeChanged) {
    await db.update(tabularCells)
      .set({ status: 'stale' })
      .where(and(eq(tabularCells.tabularReviewId, trId), eq(tabularCells.columnId, colId)));
  }

  if (rerun && questionChanged) await rerunColumnCells(trId, next);

  const full = await loadFullReview(analysisId, trId);
  res.json(full);
});

// POST /:trId/columns — add column
tabularColumnsRouter.post('/:trId/columns', async (req, res) => {
  const { analysisId, trId } = req.params;
  const { label, question, expectedType, afterColumnId, extractionStrategy, clauseTypeOntologyId, attributePath } = req.body as {
    label: string; question: string; expectedType?: string; afterColumnId?: string;
    extractionStrategy?: 'llm_only' | 'attribute_first' | 'clause_filtered_llm';
    clauseTypeOntologyId?: string; attributePath?: string;
  };

  const safeLabel = sanitizeText(label, 200);
  const safeQuestion = sanitizeText(question, 2000);
  if (!safeLabel) return res.status(400).json({ error: 'label requis' });
  if (!safeQuestion) return res.status(400).json({ error: 'question requise' });
  const type = expectedType ?? 'text';
  if (!ALLOWED_TYPES.has(type)) return res.status(400).json({ error: 'expectedType invalide' });

  const [review] = await db.select().from(tabularReviews)
    .where(and(eq(tabularReviews.id, trId), eq(tabularReviews.analysisId, analysisId)));
  if (!review) return res.status(404).json({ error: 'Tabular review not found' });

  const columns = parseColumns(review.columnsJson);
  const newCol: TabularColumn = {
    id: `col_${uuidv4().replace(/-/g, '').substring(0, 10)}`,
    label: safeLabel, question: safeQuestion, expectedType: type,
    ...(extractionStrategy && { extractionStrategy }),
    ...(clauseTypeOntologyId && { clauseTypeOntologyId }),
    ...(attributePath && { attributePath }),
  };

  if (afterColumnId) {
    const i = columns.findIndex(c => c.id === afterColumnId);
    if (i < 0) return res.status(404).json({ error: 'afterColumnId introuvable' });
    columns.splice(i + 1, 0, newCol);
  } else {
    columns.push(newCol);
  }

  await db.update(tabularReviews)
    .set({ columnsJson: JSON.stringify(columns) })
    .where(eq(tabularReviews.id, trId));

  const rows = await db.select().from(tabularRows).where(eq(tabularRows.tabularReviewId, trId));
  for (const r of rows) {
    await db.insert(tabularCells).values({
      id: cellId(),
      tabularReviewId: trId, rowId: r.id,
      columnId: newCol.id, columnLabel: newCol.label,
      value: null, rawValue: null,
      confidence: 'absent', status: 'pending', citationJson: '{}',
    });
  }

  const full = await loadFullReview(analysisId, trId);
  res.status(201).json(full);
});

// DELETE /:trId/columns/:colId
tabularColumnsRouter.delete('/:trId/columns/:colId', async (req, res) => {
  const { analysisId, trId, colId } = req.params;

  const [review] = await db.select().from(tabularReviews)
    .where(and(eq(tabularReviews.id, trId), eq(tabularReviews.analysisId, analysisId)));
  if (!review) return res.status(404).json({ error: 'Tabular review not found' });

  const columns = parseColumns(review.columnsJson);
  const idx = columns.findIndex(c => c.id === colId);
  if (idx < 0) return res.status(404).json({ error: 'Column not found' });
  if (columns.length <= 1) return res.status(409).json({ error: 'Une review doit contenir au moins une colonne.' });

  columns.splice(idx, 1);
  await db.update(tabularReviews)
    .set({ columnsJson: JSON.stringify(columns) })
    .where(eq(tabularReviews.id, trId));
  await db.delete(tabularCells)
    .where(and(eq(tabularCells.tabularReviewId, trId), eq(tabularCells.columnId, colId)));

  res.status(204).send();
});

// POST /:trId/columns/:colId/rerun
tabularColumnsRouter.post('/:trId/columns/:colId/rerun', async (req, res) => {
  const { analysisId, trId, colId } = req.params;

  const [review] = await db.select().from(tabularReviews)
    .where(and(eq(tabularReviews.id, trId), eq(tabularReviews.analysisId, analysisId)));
  if (!review) return res.status(404).json({ error: 'Tabular review not found' });

  const columns = parseColumns(review.columnsJson);
  const col = columns.find(c => c.id === colId);
  if (!col) return res.status(404).json({ error: 'Column not found' });

  await db.update(tabularCells)
    .set({ status: 'pending' })
    .where(and(eq(tabularCells.tabularReviewId, trId), eq(tabularCells.columnId, colId)));

  await rerunColumnCells(trId, col);

  const full = await loadFullReview(analysisId, trId);
  res.json(full);
});
