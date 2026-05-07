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
  const { scope, targetPath, currentValue, proposedValue, rationale,
    proposedFromAnalysisId, triggerSource, triggerRedlineId,
    targetElementId, targetElementPath } =
    req.body as {
      scope: string; targetPath: string; currentValue: string; proposedValue: string;
      rationale: string; proposedFromAnalysisId?: string;
      triggerSource?: string; triggerRedlineId?: string;
      targetElementId?: string; targetElementPath?: string;
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
    targetElementId: targetElementId ?? null,
    targetElementPath: targetElementPath ?? null,
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

  // Brief 6 §5: si accept + targetElementId, appliquer la modif sur l'élément
  if (action === 'accept' && existing.targetElementId) {
    const [asset] = await db.select().from(referenceAssets).where(eq(referenceAssets.id, assetId));
    if (asset) {
      try {
        const content = JSON.parse(asset.contentJson) as Record<string, unknown>;
        applyToElement(content, existing.targetElementId, existing.proposedValue, existing.targetElementPath ?? '');
        await db.update(referenceAssets).set({
          contentJson: JSON.stringify(content),
          lastUpdatedAt: now,
          lastUpdatedBy: 'demo-user',
        }).where(eq(referenceAssets.id, assetId));
      } catch (err) {
        console.warn('[amendments] Failed to apply targeted amendment:', err);
      }
    }
  }

  const [updated] = await db.update(amendments).set({
    status: statusMap[action],
    reviewedAt: now,
    reviewedBy: 'demo-user',
    reviewerComment: comment ?? null,
  }).where(eq(amendments.id, amendmentId)).returning();

  res.json(parse(updated));
});

// Recursively find an element by id and update its primary text field with proposedValue.
// Best-effort: works on PlaybookRequirement.ruleText, StandardClause.text, DDQuestion.text,
// ClausierVariant.text, TabularWorkflowColumn.question.
function applyToElement(node: unknown, elementId: string, proposedValue: string, _path: string): boolean {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) {
    for (const item of node) if (applyToElement(item, elementId, proposedValue, _path)) return true;
    return false;
  }
  const obj = node as Record<string, unknown>;
  if (obj['id'] === elementId) {
    // Heuristique: champs textuels mutables
    for (const k of ['ruleText', 'text', 'question', 'description', 'title', 'label']) {
      if (typeof obj[k] === 'string') {
        obj[k] = proposedValue;
        return true;
      }
    }
    return true;
  }
  for (const k of Object.keys(obj)) {
    if (applyToElement(obj[k], elementId, proposedValue, _path)) return true;
  }
  return false;
}

function parse(a: typeof amendments.$inferSelect) {
  return { ...a };
}
