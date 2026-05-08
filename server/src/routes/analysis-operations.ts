// Toutes les routes per-analysis (mounted at /api/analyses/:anaId/*) :
// - GET /:anaId, DELETE /:anaId
// - POST /:anaId/documents, DELETE /:anaId/documents/:adId
// - POST /:anaId/start-generation
// - POST /:anaId/audit, /:anaId/draft-contract, /:anaId/multi-doc-redline (Brief 8)
//
// Ne nécessite plus de wsId dans l'URL : le workspaceId est lu depuis la table
// analyses pour ré-injection dans les helpers qui en ont besoin.

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import {
  analyses, analysisDocuments, deliverables, legalObjects, documents,
  redlines, referenceAssets,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import {
  runAlignment, runConfrontation, runAggregation, runDD, runMaMapping,
  runDeadlines, runCompliance, runInconsistencies,
} from '../services/analysis.service.js';
import { generateRedline, type RedlineResult } from '../services/redline-engine.service.js';
import type { StandardContent } from '../schemas/asset-content.schema.js';
import { withViewType } from './_view-type.js';

export const analysisOperationsRouter = Router();

// ─── GET /:anaId ──────────────────────────────────────────────────────────────
analysisOperationsRouter.get('/:anaId', async (req, res) => {
  const { anaId } = req.params;
  const [ana] = await db.select().from(analyses).where(eq(analyses.id, anaId));
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

  res.json({ ...withViewType(ana), documents: docDetails, deliverables: delivRows });
});

// ─── DELETE /:anaId ───────────────────────────────────────────────────────────
analysisOperationsRouter.delete('/:anaId', async (req, res) => {
  await db.delete(analyses).where(eq(analyses.id, req.params.anaId));
  res.status(204).send();
});

// ─── POST /:anaId/documents ───────────────────────────────────────────────────
analysisOperationsRouter.post('/:anaId/documents', async (req, res) => {
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

// ─── DELETE /:anaId/documents/:adId ───────────────────────────────────────────
analysisOperationsRouter.delete('/:anaId/documents/:adId', async (req, res) => {
  await db.delete(analysisDocuments).where(
    and(eq(analysisDocuments.id, req.params.adId), eq(analysisDocuments.analysisId, req.params.anaId)),
  );
  res.status(204).send();
});

// ─── POST /:anaId/start-generation ────────────────────────────────────────────
analysisOperationsRouter.post('/:anaId/start-generation', async (req, res) => {
  const { anaId } = req.params;
  const [ana] = await db.select().from(analyses).where(eq(analyses.id, anaId));
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
      switch (operation) {
        case 'alignment': deliverableIds = await runAlignment(anaId); break;
        case 'confrontation': deliverableIds = await runConfrontation(anaId); break;
        case 'aggregation': deliverableIds = await runAggregation(anaId); break;
        case 'dd': deliverableIds = await runDD(anaId); break;
        case 'ma_mapping': deliverableIds = await runMaMapping(anaId); break;
        case 'deadlines': deliverableIds = await runDeadlines(anaId); break;
        case 'compliance': deliverableIds = await runCompliance(anaId); break;
        case 'inconsistencies': deliverableIds = await runInconsistencies(anaId); break;
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

// ─── POST /:anaId/audit (Brief 8) ─────────────────────────────────────────────
analysisOperationsRouter.post('/:anaId/audit', async (req, res) => {
  try {
    const ids = await runConfrontation(req.params.anaId);
    res.json({ deliverableIds: ids });
  } catch (err) {
    console.error('[audit] error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Audit failed' });
  }
});

// ─── POST /:anaId/draft-contract (Brief 8 — chat-to-redline cumulatif) ────────
analysisOperationsRouter.post('/:anaId/draft-contract', async (req, res) => {
  const { anaId } = req.params;
  const { standardId, contextNotes } = req.body as { standardId?: string | null; contextNotes?: string };

  try {
    const adRows = await db.select().from(analysisDocuments)
      .where(eq(analysisDocuments.analysisId, anaId));
    const target = adRows.find(r => r.role === 'target') ?? adRows[0];
    if (!target) return res.status(400).json({ error: 'Aucun document source dans cette analyse' });

    const [lo] = await db.select().from(legalObjects).where(eq(legalObjects.id, target.legalObjectId));
    if (!lo) return res.status(404).json({ error: 'Legal object introuvable' });
    const [doc] = await db.select().from(documents).where(eq(documents.id, lo.documentId));
    if (!doc) return res.status(404).json({ error: 'Document introuvable' });

    let standardContent: StandardContent | undefined;
    if (standardId) {
      const [standardAsset] = await db.select().from(referenceAssets).where(eq(referenceAssets.id, standardId));
      if (standardAsset && standardAsset.type === 'standard') {
        standardContent = JSON.parse(standardAsset.contentJson);
      }
    }

    const result = await generateRedline({
      analysisId: anaId,
      sourceDocumentId: doc.id,
      sourceLegalObjectId: lo.id,
      producedBy: 'contract_draft',
      producedFromId: standardId ?? doc.id,
      documentText: doc.extractedText ?? '',
      standardContent,
      standardAssetId: standardId ?? undefined,
      contextNotes: contextNotes ?? '',
    });

    const now = new Date().toISOString();
    const existing = await db.select().from(deliverables)
      .where(and(eq(deliverables.analysisId, anaId), eq(deliverables.type, 'redline')));

    const redlineContent = {
      type: 'redline' as const,
      targetDocumentId: lo.id,
      baseHtml: result.ckEditorHtml,
      changes: result.proposals.map((p, i) => ({
        id: p.id || `ch_${i + 1}`,
        type: p.action === 'replace' ? 'replacement' as const : p.action,
        originalText: p.originalText,
        newText: p.proposedText,
        location: { startOffset: 0, endOffset: 0 },
        clauseContext: p.clauseTypeOntologyId ?? '',
        rationale: p.rationale,
        referenceSource: standardId ?? '',
        status: 'pending' as const,
        severity: p.severity,
        deviatesFromAssetId: p.deviatesFromAssetId,
        deviatesFromElementId: p.deviatesFromElementId,
      })),
      comments: [],
    };

    if (existing.length) {
      const prev = JSON.parse(existing[0].contentJson) as typeof redlineContent;
      const merged = { ...redlineContent, changes: [...(prev.changes ?? []), ...redlineContent.changes] };
      await db.update(deliverables).set({
        contentJson: JSON.stringify(merged),
        currentVersion: (existing[0].currentVersion ?? 1) + 1,
      }).where(eq(deliverables.id, existing[0].id));
    } else {
      await db.insert(deliverables).values({
        id: `del_red_${uuidv4().replace(/-/g, '').substring(0, 8)}`,
        analysisId: anaId,
        type: 'redline',
        name: `Contrat — ${doc.fileName}`,
        createdAt: now,
        createdBy: 'ai',
        currentVersion: 1,
        status: 'draft',
        contentJson: JSON.stringify(redlineContent),
        sourceDocumentIds: JSON.stringify([lo.id]),
        referenceAssetIds: standardId ? JSON.stringify([standardId]) : '[]',
        sourceOperation: 'contract_draft',
      });
    }

    res.json({ redlineId: result.id, proposalsCount: result.proposals.length });
  } catch (err) {
    console.error('[draft-contract] error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Draft generation failed' });
  }
});

// ─── POST /:anaId/multi-doc-redline (Brief 8) ─────────────────────────────────
analysisOperationsRouter.post('/:anaId/multi-doc-redline', async (req, res) => {
  const { anaId } = req.params;
  const { sourceRedlineId, targetLegalObjectIds, targetDocumentIds } = req.body as {
    sourceRedlineId?: string | null;
    targetLegalObjectIds?: string[];
    targetDocumentIds?: string[];
  };

  let targets = targetLegalObjectIds ?? targetDocumentIds ?? [];
  if (targets.length === 0) {
    const adRows = await db.select().from(analysisDocuments)
      .where(eq(analysisDocuments.analysisId, anaId));
    targets = adRows.filter(r => r.role === 'target').map(r => r.legalObjectId);
  }
  if (targets.length === 0) return res.status(400).json({ error: 'Aucun document cible' });
  if (targets.length > 20) return res.status(400).json({ error: 'Maximum 20 documents par run (cap LLM)' });

  try {
    let sourceRedline: RedlineResult | null = null;
    if (sourceRedlineId) {
      const [r] = await db.select().from(redlines).where(eq(redlines.id, sourceRedlineId));
      if (r) {
        sourceRedline = {
          id: r.id, analysisId: r.analysisId, sourceDocumentId: r.sourceDocumentId,
          producedBy: r.producedBy as 'audit' | 'comparison' | 'contract_draft' | 'multi_doc',
          producedFromId: r.producedFromId,
          baseTextSnapshot: r.baseTextSnapshot,
          proposals: JSON.parse(r.proposalsJson),
          comments: JSON.parse(r.commentsJson),
          ckEditorHtml: '',
          status: r.status as 'draft' | 'reviewing' | 'accepted' | 'rejected',
        };
      }
    }
    if (!sourceRedline) {
      const existingRedlines = await db.select().from(deliverables)
        .where(and(eq(deliverables.analysisId, anaId), eq(deliverables.type, 'redline')));
      if (existingRedlines.length > 0) {
        const first = JSON.parse(existingRedlines[0].contentJson) as { changes?: Array<{ originalText: string; newText: string; rationale: string; severity?: string }> };
        sourceRedline = {
          id: existingRedlines[0].id,
          analysisId: anaId, sourceDocumentId: '',
          producedBy: 'multi_doc', producedFromId: '',
          baseTextSnapshot: '',
          proposals: (first.changes ?? []).map(c => ({
            id: 'p_' + Math.random().toString(36).substring(2, 8),
            action: 'replace' as const,
            originalText: c.originalText, proposedText: c.newText,
            rationale: c.rationale,
            severity: (c.severity ?? 'minor') as 'critical' | 'major' | 'minor' | 'info',
          })),
          comments: [], ckEditorHtml: '', status: 'draft',
        };
      }
    }

    const generatedIds: string[] = [];
    const now = new Date().toISOString();

    for (const targetId of targets) {
      let docId = targetId;
      const [maybeLo] = await db.select().from(legalObjects).where(eq(legalObjects.id, targetId));
      if (maybeLo) docId = maybeLo.documentId;
      const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
      if (!doc) continue;

      const result = await generateRedline({
        analysisId: anaId,
        sourceDocumentId: doc.id,
        sourceLegalObjectId: maybeLo?.id,
        producedBy: 'multi_doc',
        producedFromId: sourceRedlineId ?? '',
        documentText: doc.extractedText ?? '',
        sourceRedline,
      });

      await db.insert(deliverables).values({
        id: `del_red_${uuidv4().replace(/-/g, '').substring(0, 8)}`,
        analysisId: anaId,
        type: 'redline',
        name: `Redline propagé — ${doc.fileName}`,
        createdAt: now,
        createdBy: 'ai',
        currentVersion: 1,
        status: 'draft',
        contentJson: JSON.stringify({
          type: 'redline',
          targetDocumentId: maybeLo?.id ?? doc.id,
          baseHtml: result.ckEditorHtml,
          changes: result.proposals.map((p, i) => ({
            id: p.id || `ch_${i + 1}`,
            type: p.action === 'replace' ? 'replacement' : p.action,
            originalText: p.originalText, newText: p.proposedText,
            location: { startOffset: 0, endOffset: 0 },
            clauseContext: p.clauseTypeOntologyId ?? '',
            rationale: p.rationale, referenceSource: 'multi-doc',
            status: 'pending', severity: p.severity,
          })),
          comments: [],
        }),
        sourceDocumentIds: JSON.stringify([maybeLo?.id ?? doc.id]),
        referenceAssetIds: '[]',
        sourceOperation: 'multi_doc_redline',
      });
      generatedIds.push(result.id);
    }
    res.json({ redlineIds: generatedIds });
  } catch (err) {
    console.error('[multi-doc-redline] error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Multi-doc redline failed' });
  }
});
