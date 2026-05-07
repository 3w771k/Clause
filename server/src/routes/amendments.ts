import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { amendments, referenceAssets } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export const amendmentsRouter = Router({ mergeParams: true });

amendmentsRouter.get('/', async (req, res) => {
  const { assetId } = req.params;
  const rows = await db.select().from(amendments)
    .where(eq(amendments.assetId, assetId))
    .orderBy(amendments.proposedAt);
  res.json(rows.map(parse));
});

amendmentsRouter.post('/', async (req, res) => {
  const { assetId } = req.params;
  const { scope, targetPath, currentValue, proposedValue, rationale, proposedFromAnalysisId, triggerSource, triggerRedlineId } =
    req.body as {
      scope: string; targetPath: string; currentValue: string; proposedValue: string;
      rationale: string; proposedFromAnalysisId?: string; triggerSource?: string; triggerRedlineId?: string;
    };

  const [asset] = await db.select().from(referenceAssets).where(eq(referenceAssets.id, assetId));
  if (!asset) return res.status(404).json({ error: 'Reference asset not found' });

  const id = `amd_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  const [row] = await db.insert(amendments).values({
    id,
    assetId,
    proposedFromAnalysisId: proposedFromAnalysisId ?? null,
    scope: scope ?? 'other',
    targetPath: targetPath ?? '',
    currentValue: currentValue ?? '',
    proposedValue: proposedValue ?? '',
    rationale: rationale ?? '',
    status: 'pending',
    triggerSource: triggerSource ?? 'manual',
    triggerRedlineId: triggerRedlineId ?? null,
  }).returning();

  res.status(201).json(parse(row));
});

amendmentsRouter.patch('/:amendmentId', async (req, res) => {
  const { assetId, amendmentId } = req.params;
  const { action, comment } = req.body as { action: 'accept' | 'reject' | 'defer'; comment?: string };

  const [existing] = await db.select().from(amendments)
    .where(and(eq(amendments.id, amendmentId), eq(amendments.assetId, assetId)));
  if (!existing) return res.status(404).json({ error: 'Amendment not found' });

  const statusMap = { accept: 'accepted', reject: 'rejected', defer: 'deferred' } as const;
  const now = new Date().toISOString();

  const [updated] = await db.update(amendments).set({
    status: statusMap[action],
    reviewedAt: now,
    reviewedBy: 'demo-user',
    reviewerComment: comment ?? null,
  }).where(eq(amendments.id, amendmentId)).returning();

  res.json(parse(updated));
});

function parse(a: typeof amendments.$inferSelect) {
  return { ...a };
}
