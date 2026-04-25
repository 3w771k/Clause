import { Router } from 'express';
import { db } from '../db/index.js';
import { legalObjects, clauses, definedTerms } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getLegalObjectFull } from '../services/extraction.service.js';

export const legalObjectsRouter = Router();

legalObjectsRouter.get('/:id', async (req, res) => {
  const lo = await getLegalObjectFull(req.params.id);
  if (!lo) return res.status(404).json({ error: 'Legal object not found' });
  res.json(lo);
});

// PATCH /api/legal-objects/:id/clauses/:clauseId
legalObjectsRouter.patch('/:id/clauses/:clauseId', async (req, res) => {
  const { text, notes, heading, type } = req.body as { text?: string; notes?: string; heading?: string; type?: string };

  const [updated] = await db.update(clauses)
    .set({
      ...(type !== undefined && { type }),
      ...(text !== undefined && { text }),
      ...(notes !== undefined && { notes }),
      ...(heading !== undefined && { heading }),
      isUserModified: true,
    })
    .where(eq(clauses.id, req.params.clauseId))
    .returning();

  if (!updated) return res.status(404).json({ error: 'Clause not found' });
  res.json({
    ...updated,
    citation: JSON.parse(updated.citationJson),
    attributes: JSON.parse(updated.attributesJson),
    linkedDefinedTerms: JSON.parse(updated.linkedDefinedTerms),
    linkedClauses: JSON.parse(updated.linkedClauses),
  });
});

// DELETE /api/legal-objects/:id/clauses/:clauseId
legalObjectsRouter.delete('/:id/clauses/:clauseId', async (req, res) => {
  await db.delete(clauses).where(eq(clauses.id, req.params.clauseId));
  res.status(204).send();
});

// POST /api/legal-objects/:id/clauses  — add a user clause
legalObjectsRouter.post('/:id/clauses', async (req, res) => {
  const { type, heading, text, sequenceNumber } = req.body as {
    type: string; heading?: string; text: string; sequenceNumber?: string;
  };

  if (!type || !text) return res.status(400).json({ error: 'type and text are required' });

  const { v4: uuidv4 } = await import('uuid');
  const [inserted] = await db.insert(clauses).values({
    id: `cl_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
    legalObjectId: req.params.id,
    type,
    heading: heading ?? null,
    sequenceNumber: sequenceNumber ?? null,
    clauseOrder: 999,
    text,
    citationJson: '{}',
    attributesJson: '{}',
    confidence: 'high',
    isUserAdded: true,
    isUserModified: false,
    linkedDefinedTerms: '[]',
    linkedClauses: '[]',
  }).returning();

  res.status(201).json(inserted);
});

// PATCH /api/legal-objects/:id/metadata
legalObjectsRouter.patch('/:id/metadata', async (req, res) => {
  const { metadata } = req.body as { metadata: Record<string, unknown> };
  if (!metadata) return res.status(400).json({ error: 'metadata is required' });

  const [updated] = await db.update(legalObjects)
    .set({ metadataJson: JSON.stringify(metadata) })
    .where(eq(legalObjects.id, req.params.id))
    .returning();

  if (!updated) return res.status(404).json({ error: 'Legal object not found' });
  res.json({ ...updated, metadata: JSON.parse(updated.metadataJson) });
});
