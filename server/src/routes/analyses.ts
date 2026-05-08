// Routes scopées workspace : list + create d'analyses.
// Tous les autres endpoints per-analysis (GET/DELETE/docs/start-gen + audit/draft/multi-doc)
// vivent dans analysis-operations.ts sous /api/analyses/:anaId.
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { analyses } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { mapOperationToViewType, withViewType } from './_view-type.js';

export const analysesRouter = Router({ mergeParams: true });

analysesRouter.get('/', async (req, res) => {
  const { wsId } = req.params;
  const rows = await db.select().from(analyses)
    .where(eq(analyses.workspaceId, wsId))
    .orderBy(analyses.lastActivityAt);
  res.json(rows.map(withViewType));
});

analysesRouter.post('/', async (req, res) => {
  const { wsId } = req.params;
  const { name, operation, viewType, referenceAssetId } = req.body as {
    name: string; operation?: string; viewType?: string; referenceAssetId?: string;
  };
  if (!name) return res.status(400).json({ error: 'name is required' });

  const now = new Date().toISOString();
  const finalViewType = viewType ?? mapOperationToViewType(operation);
  const [row] = await db.insert(analyses).values({
    id: `ana_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
    workspaceId: wsId,
    name,
    createdAt: now,
    lastActivityAt: now,
    status: 'active',
    operation: operation ?? 'unclear',
    viewType: finalViewType,
    referenceAssetId: referenceAssetId ?? null,
  }).returning();
  res.status(201).json(withViewType(row));
});
