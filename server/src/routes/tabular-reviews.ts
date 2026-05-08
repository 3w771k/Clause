import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import {
  tabularReviews, tabularRows, tabularCells,
  analyses, analysisDocuments, documents, legalObjects, clauses, referenceAssets,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import {
  TabularColumn, parseColumns, cellId, extractCellValue, syncColumnsWithWorkflow,
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

// ─── Routes statiques (DOIVENT être avant /:trId sinon Express les avale) ────

// GET /clause-types-preview — agrégation des types de clauses dans l'analyse + diagnostic
tabularReviewsRouter.get('/clause-types-preview', async (req, res) => {
  const { analysisId } = req.params;
  const ads = await db.select({ legalObjectId: analysisDocuments.legalObjectId })
    .from(analysisDocuments).where(eq(analysisDocuments.analysisId, analysisId));
  if (!ads.length) {
    return res.json({ types: [], diagnostic: { hint: 'Aucun document dans cette analyse.' } });
  }

  const map = new Map<string, { count: number; sample: string; attributeKeys: Set<string> }>();
  const docDiagnostics: Array<{ documentId: string; fileName: string; extractionStatus: string; clausesCount: number; typedClausesCount: number }> = [];

  for (const ad of ads) {
    const [lo] = await db.select().from(legalObjects).where(eq(legalObjects.id, ad.legalObjectId));
    if (!lo) continue;
    const [doc] = await db.select({ id: documents.id, fileName: documents.fileName, status: documents.legalExtractionStatus })
      .from(documents).where(eq(documents.id, lo.documentId));
    const cls = await db.select({ type: clauses.type, heading: clauses.heading, text: clauses.text, attrs: clauses.attributesJson })
      .from(clauses).where(eq(clauses.legalObjectId, ad.legalObjectId));
    let typed = 0;
    for (const c of cls) {
      if (!c.type || c.type.trim() === '') continue;
      typed++;
      const e = map.get(c.type) ?? { count: 0, sample: c.heading ?? c.text.substring(0, 80), attributeKeys: new Set<string>() };
      e.count++;
      try {
        const a = JSON.parse(c.attrs) as Record<string, unknown>;
        for (const k of Object.keys(a)) e.attributeKeys.add(k);
      } catch { /* skip */ }
      map.set(c.type, e);
    }
    docDiagnostics.push({
      documentId: doc?.id ?? lo.documentId,
      fileName: doc?.fileName ?? lo.documentId,
      extractionStatus: doc?.status ?? 'unknown',
      clausesCount: cls.length,
      typedClausesCount: typed,
    });
  }

  const types = Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count)
    .map(([type, info]) => ({
      type, count: info.count, sample: info.sample,
      attributeKeys: Array.from(info.attributeKeys),
    }));

  let hint: string | undefined;
  if (types.length === 0) {
    const notExtracted = docDiagnostics.filter(d => d.extractionStatus !== 'done' && d.extractionStatus !== 'completed');
    if (notExtracted.length === docDiagnostics.length) {
      hint = `Aucun document n'a encore été extrait. Va sur la page de chaque document et clique "Extraire" (statut actuel : ${notExtracted.map(d => d.extractionStatus).join(', ')}).`;
    } else if (notExtracted.length > 0) {
      hint = `${notExtracted.length}/${docDiagnostics.length} documents pas encore extraits. Les autres ont des clauses sans type ontologique.`;
    } else {
      hint = `Tous les documents sont extraits mais aucune clause n'a de type ontologique reconnu. L'extraction a peut-être échoué silencieusement — relancer "Extraire".`;
    }
  }

  res.json({ types, diagnostic: { hint, docs: docDiagnostics } });
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

  // Brief F1 — sync les annotations workflow → colonnes (idempotent)
  const syncedColumns = await syncColumnsWithWorkflow(trId, parseColumns(review.columnsJson), review.workflowId);

  res.json({
    ...review,
    columns: syncedColumns,
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

  // Brief F1 — auto-resync les annotations d'extraction depuis le workflow OOTB
  const columns = await syncColumnsWithWorkflow(trId, parseColumns(review.columnsJson), review.workflowId);
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

// GET /clause-types-preview — agrégation des types de clauses dans l'analyse
// + diagnostic clair quand 0 types détectés (status d'extraction par doc)
// Note : ce handler reste ici comme alias mais il EST dupliqué plus haut
// avant /:trId — voir bloc "Routes statiques (avant /:trId pour Express order)"
tabularReviewsRouter.get('/clause-types-preview-legacy', async (_req, res) => {
  res.status(410).json({ error: 'Use /clause-types-preview' });
});

// ─── Brief I2 — Template preview : voir le match colonne-par-colonne avant créer ─
// POST /tabular-reviews/template-preview body { workflowId }
// Pour chaque colonne du template, indique combien de docs ont une clause
// du type cible (et un sample de texte). L'user voit avant création quels
// colonnes seront populées en lookup_first vs en fallback LLM.
tabularReviewsRouter.post('/template-preview', async (req, res) => {
  const { analysisId } = req.params;
  const { workflowId } = req.body as { workflowId: string };
  if (!workflowId) return res.status(400).json({ error: 'workflowId requis' });

  const wfAssetId = workflowId.startsWith('wf_') ? workflowId : `wf_${workflowId}`;
  const [asset] = await db.select().from(referenceAssets).where(eq(referenceAssets.id, wfAssetId));
  if (!asset) return res.status(404).json({ error: 'Workflow introuvable' });

  let wfColumns: Array<{ id?: string; label: string; question: string; expectedType: string; clauseTypeOntologyId?: string; attributePath?: string; extractionStrategy?: string }>;
  try {
    const content = JSON.parse(asset.contentJson) as { columns: typeof wfColumns };
    wfColumns = content.columns ?? [];
  } catch { return res.status(500).json({ error: 'Workflow content malformé' }); }

  const ads = await db.select({ legalObjectId: analysisDocuments.legalObjectId })
    .from(analysisDocuments).where(eq(analysisDocuments.analysisId, analysisId));
  const legalObjectIds = ads.map(a => a.legalObjectId);

  // Collecte les types de clauses présents par doc
  const typesByDoc = new Map<string, Set<string>>();
  const sampleByType = new Map<string, string>();
  for (const loId of legalObjectIds) {
    const cls = await db.select({ type: clauses.type, text: clauses.text, attrs: clauses.attributesJson })
      .from(clauses).where(eq(clauses.legalObjectId, loId));
    const set = new Set<string>();
    for (const c of cls) {
      if (c.type) {
        set.add(c.type);
        if (!sampleByType.has(c.type)) sampleByType.set(c.type, c.text.substring(0, 200));
      }
    }
    typesByDoc.set(loId, set);
  }

  const totalDocs = legalObjectIds.length;
  const columns = wfColumns.map(col => {
    const matchedDocs = col.clauseTypeOntologyId
      ? legalObjectIds.filter(id => typesByDoc.get(id)?.has(col.clauseTypeOntologyId!)).length
      : 0;
    return {
      label: col.label,
      clauseTypeOntologyId: col.clauseTypeOntologyId ?? null,
      attributePath: col.attributePath ?? null,
      extractionStrategy: col.extractionStrategy ?? (col.clauseTypeOntologyId ? 'lookup_first' : 'llm_only'),
      matchedDocs,
      totalDocs,
      willUseLookup: matchedDocs > 0,
      sampleValue: col.clauseTypeOntologyId ? sampleByType.get(col.clauseTypeOntologyId) ?? null : null,
    };
  });

  res.json({
    workflowId,
    workflowName: asset.name,
    workflowDescription: asset.description,
    totalDocs,
    columns,
  });
});

// ─── Brief G — Auto-build : créer une review depuis les clauses extraites ─────
// POST /api/analyses/:analysisId/tabular-reviews/auto-build
// Body: { name?: string, includedTypes?: string[] }
// Crée une review avec 1 colonne par type de clause détecté (lookup_first par défaut).
// Pas d'appel LLM — les cells seront populated au prochain /run via lookup direct.
tabularReviewsRouter.post('/auto-build', async (req, res) => {
  const { analysisId } = req.params;
  const { name, includedTypes } = req.body as { name?: string; includedTypes?: string[] };

  // Charge les types de clauses présents dans l'analyse
  const ads = await db.select({ legalObjectId: analysisDocuments.legalObjectId })
    .from(analysisDocuments).where(eq(analysisDocuments.analysisId, analysisId));
  if (!ads.length) return res.status(400).json({ error: 'Aucun document dans cette analyse' });

  const typeMap = new Map<string, { count: number; sample: string }>();
  for (const ad of ads) {
    const cls = await db.select({ type: clauses.type, heading: clauses.heading, text: clauses.text })
      .from(clauses).where(eq(clauses.legalObjectId, ad.legalObjectId));
    for (const c of cls) {
      const e = typeMap.get(c.type) ?? { count: 0, sample: c.heading ?? c.text.substring(0, 80) };
      e.count++;
      typeMap.set(c.type, e);
    }
  }

  let types = Array.from(typeMap.entries()).sort((a, b) => b[1].count - a[1].count);
  if (includedTypes?.length) {
    const wanted = new Set(includedTypes);
    types = types.filter(([t]) => wanted.has(t));
  }
  if (types.length === 0) {
    return res.status(400).json({
      error: 'Aucune clause typée trouvée. Vérifie que les documents ont bien été extraits (bouton "Extraire" sur chaque doc).',
    });
  }

  // Humanise un type ontologique : "LIMITATION_RESPONSABILITE" → "Limitation responsabilité"
  const humanize = (type: string) =>
    type.toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const cols: TabularColumn[] = types.map(([type, info], i) => ({
    id: `col_${i}`,
    label: humanize(type),
    question: `Que dit la clause "${humanize(type)}" ?`,
    expectedType: 'text',
    extractionStrategy: 'lookup_first',
    clauseTypeOntologyId: type,
  }));

  const id = `tr_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  const reviewName = name?.trim() || `Tableau auto — ${new Date().toLocaleDateString('fr-FR')}`;

  const [row] = await db.insert(tabularReviews).values({
    id,
    analysisId,
    name: reviewName,
    workflowId: undefined,
    isCustom: true,
    columnsJson: JSON.stringify(cols),
  }).returning();

  res.status(201).json({
    ...row,
    columns: cols,
    detectedTypes: types.map(([type, info]) => ({ type, count: info.count, sample: info.sample })),
  });
});

// ─── Brief E — Preview des types de clauses + attributs disponibles dans l'analyse ─
tabularReviewsRouter.get('/:trId/clause-types', async (req, res) => {
  const { analysisId } = req.params;
  const ads = await db.select({ legalObjectId: analysisDocuments.legalObjectId })
    .from(analysisDocuments).where(eq(analysisDocuments.analysisId, analysisId));
  if (!ads.length) return res.json({ types: [] });

  const summary = new Map<string, { count: number; attributeKeys: Set<string>; sample: string }>();
  for (const ad of ads) {
    const cl = await db.select({ type: clauses.type, text: clauses.text, attrs: clauses.attributesJson })
      .from(clauses).where(eq(clauses.legalObjectId, ad.legalObjectId));
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
