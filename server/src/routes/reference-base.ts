import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { referenceAssets, referenceAssetVersions, legalObjects, clauses, documents } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const referenceBaseRouter = Router();

referenceBaseRouter.get('/', async (req, res) => {
  const { type } = req.query as { type?: string };
  let query = db.select().from(referenceAssets);
  if (type) {
    const rows = await db.select().from(referenceAssets)
      .where(eq(referenceAssets.type, type))
      .orderBy(referenceAssets.name);
    return res.json(rows.map(parseAsset));
  }
  const rows = await query.orderBy(referenceAssets.name);
  res.json(rows.map(parseAsset));
});

referenceBaseRouter.post('/', async (req, res) => {
  const { type, name, description, content, jurisdiction, language, tags } =
    req.body as {
      type: string; name: string; description?: string; content: unknown;
      jurisdiction?: string; language?: string; tags?: string[];
    };
  if (!type || !name) return res.status(400).json({ error: 'type and name are required' });

  const now = new Date().toISOString();
  const id = `ra_${uuidv4().replace(/-/g, '').substring(0, 12)}`;

  const [asset] = await db.insert(referenceAssets).values({
    id,
    type,
    name,
    description: description ?? '',
    createdAt: now,
    createdBy: 'demo-user',
    lastUpdatedAt: now,
    lastUpdatedBy: 'demo-user',
    ontologyId: 'maison',
    jurisdiction: jurisdiction ?? null,
    language: language ?? 'fr',
    currentVersion: 1,
    governanceStatus: 'draft',
    tags: JSON.stringify(tags ?? []),
    contentJson: JSON.stringify(content ?? {}),
  }).returning();

  await db.insert(referenceAssetVersions).values({
    id: `rav_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
    assetId: id,
    version: 1,
    createdAt: now,
    createdBy: 'demo-user',
    summary: 'Version initiale',
    contentJson: JSON.stringify(content ?? {}),
  });

  res.status(201).json(parseAsset(asset));
});

// ─── GET /api/reference-base/available-documents ────────────────────────────
// All extracted documents across workspaces (for the "from document" picker)

referenceBaseRouter.get('/available-documents', async (_req, res) => {
  const rows = await db.select({
    legalObjectId: legalObjects.id,
    documentId: documents.id,
    fileName: documents.fileName,
    workspaceId: documents.workspaceId,
    uploadedAt: documents.uploadedAt,
  })
    .from(legalObjects)
    .innerJoin(documents, eq(documents.id, legalObjects.documentId))
    .where(eq(documents.legalExtractionStatus, 'done'));

  res.json(rows);
});

// ─── POST /api/reference-base/from-document ──────────────────────────────────

referenceBaseRouter.post('/from-document', async (req, res) => {
  const { legalObjectId, name, description, type, qualifications } = req.body as {
    legalObjectId: string; name: string; description?: string; type?: string;
    qualifications?: Record<string, 'ideal' | 'fallback' | 'red_flag' | 'ignore'>;
  };
  if (!legalObjectId || !name) return res.status(400).json({ error: 'legalObjectId and name are required' });

  const [lo] = await db.select().from(legalObjects).where(eq(legalObjects.id, legalObjectId));
  if (!lo) return res.status(404).json({ error: 'Legal object not found' });

  const [doc] = await db.select({ fileName: documents.fileName })
    .from(documents).where(eq(documents.id, lo.documentId));

  const clauseRows = await db.select({ id: clauses.id, type: clauses.type, heading: clauses.heading, text: clauses.text })
    .from(clauses).where(eq(clauses.legalObjectId, legalObjectId));

  let content: Record<string, unknown>;

  if (type === 'playbook' && qualifications) {
    // Build structured playbook: group by clauseType, fill positions per qualification
    const sections: Record<string, {
      clauseType: string;
      positions: { ideal?: { description: string }; fallback?: { description: string }; redFlag?: { description: string } };
      sourceClauseIds: string[];
    }> = {};
    for (const c of clauseRows) {
      const qual = qualifications[c.id];
      if (!qual || qual === 'ignore') continue;
      if (!sections[c.type]) {
        sections[c.type] = { clauseType: c.type, positions: {}, sourceClauseIds: [] };
      }
      sections[c.type].sourceClauseIds.push(c.id);
      const text = c.text;
      if (qual === 'ideal') {
        sections[c.type].positions.ideal = { description: text };
      } else if (qual === 'fallback') {
        sections[c.type].positions.fallback = { description: text };
      } else if (qual === 'red_flag') {
        sections[c.type].positions.redFlag = { description: text };
      }
    }
    content = {
      scope: description ?? '',
      sourceDocumentName: doc?.fileName ?? name,
      sections: Object.values(sections),
    };
  } else {
    content = {
      documentName: doc?.fileName ?? name,
      legalObjectId,
      clauses: clauseRows.map(c => ({ type: c.type, label: c.heading ?? c.type, text: c.text })),
    };
  }

  const now = new Date().toISOString();
  const id = `ra_${uuidv4().replace(/-/g, '').substring(0, 12)}`;

  const [asset] = await db.insert(referenceAssets).values({
    id,
    type: type ?? 'document',
    name,
    description: description ?? '',
    createdAt: now,
    createdBy: 'demo-user',
    lastUpdatedAt: now,
    lastUpdatedBy: 'demo-user',
    ontologyId: 'maison',
    jurisdiction: null,
    language: 'fr',
    currentVersion: 1,
    governanceStatus: 'draft',
    tags: '[]',
    contentJson: JSON.stringify(content),
  }).returning();

  await db.insert(referenceAssetVersions).values({
    id: `rav_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
    assetId: id,
    version: 1,
    createdAt: now,
    createdBy: 'demo-user',
    summary: 'Version initiale (depuis document)',
    contentJson: JSON.stringify(content),
  });

  res.status(201).json(parseAsset(asset));
});

referenceBaseRouter.get('/:id', async (req, res) => {
  const [asset] = await db.select().from(referenceAssets)
    .where(eq(referenceAssets.id, req.params.id));
  if (!asset) return res.status(404).json({ error: 'Reference asset not found' });
  res.json(parseAsset(asset));
});

referenceBaseRouter.put('/:id', async (req, res) => {
  const [existing] = await db.select().from(referenceAssets)
    .where(eq(referenceAssets.id, req.params.id));
  if (!existing) return res.status(404).json({ error: 'Reference asset not found' });

  const { name, description, content, governanceStatus, tags } =
    req.body as { name?: string; description?: string; content?: unknown; governanceStatus?: string; tags?: string[] };

  const now = new Date().toISOString();
  const newVersion = existing.currentVersion + 1;

  // Archive old version
  await db.insert(referenceAssetVersions).values({
    id: `rav_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
    assetId: existing.id,
    version: existing.currentVersion,
    createdAt: existing.lastUpdatedAt,
    createdBy: existing.lastUpdatedBy,
    summary: `Version ${existing.currentVersion}`,
    contentJson: existing.contentJson,
  });

  const [updated] = await db.update(referenceAssets)
    .set({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(content !== undefined && { contentJson: JSON.stringify(content) }),
      ...(governanceStatus !== undefined && { governanceStatus }),
      ...(tags !== undefined && { tags: JSON.stringify(tags) }),
      lastUpdatedAt: now,
      lastUpdatedBy: 'demo-user',
      currentVersion: newVersion,
    })
    .where(eq(referenceAssets.id, req.params.id))
    .returning();

  res.json(parseAsset(updated));
});

referenceBaseRouter.delete('/:id', async (req, res) => {
  await db.delete(referenceAssets).where(eq(referenceAssets.id, req.params.id));
  res.status(204).send();
});

referenceBaseRouter.get('/:id/versions', async (req, res) => {
  const versions = await db.select().from(referenceAssetVersions)
    .where(eq(referenceAssetVersions.assetId, req.params.id))
    .orderBy(referenceAssetVersions.version);
  res.json(versions.map((v) => ({ ...v, content: JSON.parse(v.contentJson) })));
});

function parseAsset(asset: typeof referenceAssets.$inferSelect) {
  return {
    ...asset,
    content: JSON.parse(asset.contentJson),
    tags: JSON.parse(asset.tags),
  };
}
