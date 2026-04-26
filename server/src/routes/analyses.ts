import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import {
  analyses, analysisDocuments, deliverables, legalObjects, documents,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { runAlignment, runConfrontation, runAggregation, runDD, runMaMapping, runDeadlines, runCompliance, runInconsistencies } from '../services/analysis.service.js';

export const analysesRouter = Router({ mergeParams: true });

// ─── List / Create (scoped to workspace) ─────────────────────────────────────

analysesRouter.get('/', async (req, res) => {
  const { wsId } = req.params;
  const rows = await db.select().from(analyses)
    .where(eq(analyses.workspaceId, wsId))
    .orderBy(analyses.lastActivityAt);
  res.json(rows);
});

analysesRouter.post('/', async (req, res) => {
  const { wsId } = req.params;
  const { name, operation, referenceAssetId } = req.body as {
    name: string; operation?: string; referenceAssetId?: string;
  };
  if (!name) return res.status(400).json({ error: 'name is required' });

  const now = new Date().toISOString();
  const [row] = await db.insert(analyses).values({
    id: `ana_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
    workspaceId: wsId,
    name,
    createdAt: now,
    lastActivityAt: now,
    status: 'active',
    operation: operation ?? 'unclear',
    referenceAssetId: referenceAssetId ?? null,
  }).returning();
  res.status(201).json(row);
});

// ─── Single analysis ──────────────────────────────────────────────────────────

analysesRouter.get('/:anaId', async (req, res) => {
  const { wsId, anaId } = req.params;
  const [ana] = await db.select().from(analyses)
    .where(and(eq(analyses.id, anaId), eq(analyses.workspaceId, wsId)));
  if (!ana) return res.status(404).json({ error: 'Analysis not found' });

  const adRows = await db.select().from(analysisDocuments)
    .where(eq(analysisDocuments.analysisId, anaId))
    .orderBy(analysisDocuments.orderInAnalysis);

  const docDetails = await Promise.all(
    adRows.map(async (ad) => {
      const [lo] = await db.select().from(legalObjects).where(eq(legalObjects.id, ad.legalObjectId));
      if (!lo) return { ...ad, documentName: null };
      const [doc] = await db.select({ fileName: documents.fileName })
        .from(documents).where(eq(documents.id, lo.documentId));
      return {
        ...ad,
        documentName: doc?.fileName ?? lo.id,
        documentType: lo.documentType,
        documentSubtype: lo.documentSubtype,
      };
    }),
  );

  const delivRows = await db.select({
    id: deliverables.id,
    type: deliverables.type,
    name: deliverables.name,
    status: deliverables.status,
    createdAt: deliverables.createdAt,
    sourceOperation: deliverables.sourceOperation,
  }).from(deliverables).where(eq(deliverables.analysisId, anaId));

  res.json({ ...ana, documents: docDetails, deliverables: delivRows });
});

analysesRouter.delete('/:anaId', async (req, res) => {
  await db.delete(analyses).where(
    and(eq(analyses.id, req.params.anaId), eq(analyses.workspaceId, req.params.wsId)),
  );
  res.status(204).send();
});

// ─── Analysis documents ───────────────────────────────────────────────────────

analysesRouter.post('/:anaId/documents', async (req, res) => {
  const { anaId } = req.params;
  const { legalObjectId, role } = req.body as { legalObjectId: string; role?: string };
  if (!legalObjectId) return res.status(400).json({ error: 'legalObjectId is required' });

  const [lo] = await db.select().from(legalObjects).where(eq(legalObjects.id, legalObjectId));
  if (!lo) return res.status(404).json({ error: 'Legal object not found' });

  const existing = await db.select().from(analysisDocuments)
    .where(and(eq(analysisDocuments.analysisId, anaId), eq(analysisDocuments.legalObjectId, legalObjectId)));
  if (existing.length) return res.status(409).json({ error: 'Document already in analysis' });

  const count = await db.select().from(analysisDocuments).where(eq(analysisDocuments.analysisId, anaId));

  const [row] = await db.insert(analysisDocuments).values({
    id: `ad_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
    analysisId: anaId,
    legalObjectId,
    role: role ?? 'target',
    addedAt: new Date().toISOString(),
    orderInAnalysis: count.length,
  }).returning();
  res.status(201).json(row);
});

analysesRouter.delete('/:anaId/documents/:adId', async (req, res) => {
  await db.delete(analysisDocuments).where(
    and(eq(analysisDocuments.id, req.params.adId), eq(analysisDocuments.analysisId, req.params.anaId)),
  );
  res.status(204).send();
});

// ─── Start generation (called by wizard after creating analysis + docs) ───────

analysesRouter.post('/:anaId/start-generation', async (req, res) => {
  const { anaId, wsId } = req.params;

  const [ana] = await db.select().from(analyses)
    .where(and(eq(analyses.id, anaId), eq(analyses.workspaceId, wsId)));
  if (!ana) return res.status(404).json({ error: 'Analysis not found' });

  const operation = ana.operation ?? 'unclear';

  await db.update(analyses)
    .set({ status: 'generating', lastActivityAt: new Date().toISOString() })
    .where(eq(analyses.id, anaId));

  res.status(202).json({ status: 'generating' });

  setImmediate(async () => {
    let deliverableIds: string[] = [];
    let finalStatus: 'active' | 'error' = 'active';
    try {
      if (operation === 'alignment') {
        deliverableIds = await runAlignment(anaId);
      } else if (operation === 'confrontation') {
        deliverableIds = await runConfrontation(anaId);
      } else if (operation === 'aggregation') {
        deliverableIds = await runAggregation(anaId);
      } else if (operation === 'dd') {
        deliverableIds = await runDD(anaId);
      } else if (operation === 'ma_mapping') {
        deliverableIds = await runMaMapping(anaId);
      } else if (operation === 'deadlines') {
        deliverableIds = await runDeadlines(anaId);
      } else if (operation === 'compliance') {
        deliverableIds = await runCompliance(anaId);
      } else if (operation === 'inconsistencies') {
        deliverableIds = await runInconsistencies(anaId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[start-generation][${anaId}] Error: ${msg}`);
      finalStatus = 'error';
    }

    await db.update(analyses)
      .set({ status: finalStatus, lastActivityAt: new Date().toISOString() })
      .where(eq(analyses.id, anaId));

    console.log(`[start-generation][${anaId}] Done. deliverables: ${deliverableIds}`);
  });
});
