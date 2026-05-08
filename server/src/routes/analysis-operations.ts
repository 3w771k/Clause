// Brief 8 §5 — Endpoints des nouvelles vues (audit / draft-contract / multi-doc-redline).
// Monté à plat sous /api/analyses (pas /api/workspaces/:wsId/analyses) pour matcher
// la convention frontend AnalysisService qui utilise ${api.base}/analyses/:anaId/...
//
// NOTE structurelle : analysesRouter (CRUD analyses) reste sous /api/workspaces/:wsId/analyses.
// On a deux montages distincts faute d'un refactor du wsId-scoping. Hors-scope court terme.

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import {
  analysisDocuments, deliverables, legalObjects, documents, redlines, referenceAssets,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { runConfrontation } from '../services/analysis.service.js';
import { generateRedline, type RedlineResult } from '../services/redline-engine.service.js';
import type { StandardContent } from '../schemas/asset-content.schema.js';

export const analysisOperationsRouter = Router();

// POST /:anaId/audit — déclenche runConfrontation (qui produit note + redline)
analysisOperationsRouter.post('/:anaId/audit', async (req, res) => {
  try {
    const ids = await runConfrontation(req.params.anaId);
    res.json({ deliverableIds: ids });
  } catch (err) {
    console.error('[audit] error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Audit failed' });
  }
});

// POST /:anaId/draft-contract — chat-to-redline cumulatif sur le doc source
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

// POST /:anaId/multi-doc-redline — propage une décision sur N docs cibles
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
