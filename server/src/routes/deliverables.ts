import { Router } from 'express';
import { db } from '../db/index.js';
import { deliverables, deliverableVersions, referenceAssets, referenceAssetVersions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export const deliverablesRouter = Router();

deliverablesRouter.get('/', async (_req, res) => {
  const rows = await db.select({
    id: deliverables.id,
    analysisId: deliverables.analysisId,
    type: deliverables.type,
    name: deliverables.name,
    createdAt: deliverables.createdAt,
    status: deliverables.status,
    currentVersion: deliverables.currentVersion,
    sourceOperation: deliverables.sourceOperation,
  }).from(deliverables);
  res.json(rows);
});

deliverablesRouter.get('/:id', async (req, res) => {
  const [del] = await db.select().from(deliverables).where(eq(deliverables.id, req.params.id));
  if (!del) return res.status(404).json({ error: 'Deliverable not found' });
  res.json({
    ...del,
    content: JSON.parse(del.contentJson),
    sourceDocumentIds: JSON.parse(del.sourceDocumentIds),
    referenceAssetIds: JSON.parse(del.referenceAssetIds),
  });
});

deliverablesRouter.get('/:id/versions', async (req, res) => {
  const versions = await db.select().from(deliverableVersions)
    .where(eq(deliverableVersions.deliverableId, req.params.id))
    .orderBy(deliverableVersions.version);
  res.json(versions.map((v) => ({ ...v, content: JSON.parse(v.contentJson) })));
});

deliverablesRouter.put('/:id', async (req, res) => {
  const [del] = await db.select().from(deliverables).where(eq(deliverables.id, req.params.id));
  if (!del) return res.status(404).json({ error: 'Deliverable not found' });

  const { content, status } = req.body as { content?: unknown; status?: string };
  const newVersion = del.currentVersion + 1;

  // Archive current version
  await db.insert(deliverableVersions).values({
    id: `dv_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
    deliverableId: del.id,
    version: del.currentVersion,
    createdAt: del.createdAt,
    createdBy: del.createdBy,
    summary: `Version ${del.currentVersion}`,
    contentJson: del.contentJson,
  });

  const [updated] = await db.update(deliverables)
    .set({
      ...(content !== undefined && { contentJson: JSON.stringify(content) }),
      ...(status !== undefined && { status }),
      currentVersion: newVersion,
    })
    .where(eq(deliverables.id, req.params.id))
    .returning();

  res.json({
    ...updated,
    content: JSON.parse(updated.contentJson),
    sourceDocumentIds: JSON.parse(updated.sourceDocumentIds),
    referenceAssetIds: JSON.parse(updated.referenceAssetIds),
  });
});

// Publish deliverable as a reference asset
deliverablesRouter.post('/:id/publish', async (req, res) => {
  const [del] = await db.select().from(deliverables).where(eq(deliverables.id, req.params.id));
  if (!del) return res.status(404).json({ error: 'Deliverable not found' });

  const { name, description, type } = req.body as { name?: string; description?: string; type?: string };
  const now = new Date().toISOString();
  const assetId = `ra_${uuidv4().replace(/-/g, '').substring(0, 12)}`;

  const assetType = type ?? (del.type === 'clausier' ? 'clausier' : del.type === 'review_note' ? 'playbook' : 'nda_standard');

  const [asset] = await db.insert(referenceAssets).values({
    id: assetId,
    type: assetType,
    name: name ?? del.name,
    description: description ?? `Publié depuis le livrable ${del.id}`,
    createdAt: now,
    createdBy: 'demo-user',
    lastUpdatedAt: now,
    lastUpdatedBy: 'demo-user',
    ontologyId: 'maison',
    language: 'fr',
    currentVersion: 1,
    governanceStatus: 'draft',
    tags: '[]',
    contentJson: del.contentJson,
  }).returning();

  await db.insert(referenceAssetVersions).values({
    id: `rav_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
    assetId,
    version: 1,
    createdAt: now,
    createdBy: 'demo-user',
    summary: 'Version initiale publiée depuis livrable',
    contentJson: del.contentJson,
  });

  await db.update(deliverables)
    .set({ publishedAssetId: assetId, status: 'published' })
    .where(eq(deliverables.id, req.params.id));

  res.status(201).json({ asset, deliverableId: del.id });
});

// Accept/reject redline changes
deliverablesRouter.post('/:id/redline/accept', async (req, res) => {
  const { changeId } = req.body as { changeId: string };
  const [del] = await db.select().from(deliverables).where(eq(deliverables.id, req.params.id));
  if (!del || del.type !== 'redline') return res.status(404).json({ error: 'Redline not found' });

  const content = JSON.parse(del.contentJson) as { changes?: Array<{ id: string; status: string }>; totalChanges?: number };
  content.changes = (content.changes ?? []).map((c) => c.id === changeId ? { ...c, status: 'accepted' } : c);
  const remainingPending = content.changes.filter((c) => c.status === 'pending').length;

  await db.update(deliverables)
    .set({ contentJson: JSON.stringify(content) })
    .where(eq(deliverables.id, req.params.id));

  res.json({ accepted: changeId, remainingPending });
});

deliverablesRouter.post('/:id/redline/reject', async (req, res) => {
  const { changeId } = req.body as { changeId: string };
  const [del] = await db.select().from(deliverables).where(eq(deliverables.id, req.params.id));
  if (!del || del.type !== 'redline') return res.status(404).json({ error: 'Redline not found' });

  const content = JSON.parse(del.contentJson) as { changes?: Array<{ id: string; status: string }>; totalChanges?: number };
  content.changes = (content.changes ?? []).map((c) => c.id === changeId ? { ...c, status: 'rejected' } : c);
  const remainingPending = content.changes.filter((c) => c.status === 'pending').length;

  await db.update(deliverables)
    .set({ contentJson: JSON.stringify(content) })
    .where(eq(deliverables.id, req.params.id));

  res.json({ rejected: changeId, remainingPending });
});

// Accept all / Reject all
deliverablesRouter.post('/:id/redline/accept-all', async (req, res) => {
  const [del] = await db.select().from(deliverables).where(eq(deliverables.id, req.params.id));
  if (!del || del.type !== 'redline') return res.status(404).json({ error: 'Redline not found' });

  const content = JSON.parse(del.contentJson) as { changes?: Array<{ id: string; status: string }> };
  content.changes = (content.changes ?? []).map((c) => c.status === 'pending' ? { ...c, status: 'accepted' } : c);

  await db.update(deliverables)
    .set({ contentJson: JSON.stringify(content) })
    .where(eq(deliverables.id, req.params.id));

  res.json({ acceptedAll: true });
});

deliverablesRouter.post('/:id/redline/reject-all', async (req, res) => {
  const [del] = await db.select().from(deliverables).where(eq(deliverables.id, req.params.id));
  if (!del || del.type !== 'redline') return res.status(404).json({ error: 'Redline not found' });

  const content = JSON.parse(del.contentJson) as { changes?: Array<{ id: string; status: string }> };
  content.changes = (content.changes ?? []).map((c) => c.status === 'pending' ? { ...c, status: 'rejected' } : c);

  await db.update(deliverables)
    .set({ contentJson: JSON.stringify(content) })
    .where(eq(deliverables.id, req.params.id));

  res.json({ rejectedAll: true });
});
