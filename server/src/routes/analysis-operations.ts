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
  analyses, analysisDocuments, deliverables, legalObjects, documents, clauses,
  redlines, referenceAssets,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import {
  runAlignment, runConfrontation, runAggregation, runDD, runMaMapping,
  runDeadlines, runCompliance, runInconsistencies,
} from '../services/analysis.service.js';
import { generateRedline, buildMultiDocRedlineHtml, wordLevelDiff, type RedlineResult, type ClauseDiffSection } from '../services/redline-engine.service.js';
import type { StandardContent, PlaybookContent, ClausierAssetContent } from '../schemas/asset-content.schema.js';
import Anthropic from '@anthropic-ai/sdk';
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
    // Charge les clauseSections de la source (redline d'audit ou de comparaison)
    let sourceSections: ClauseDiffSection[] = [];

    if (sourceRedlineId) {
      const [delRow] = await db.select().from(deliverables).where(eq(deliverables.id, sourceRedlineId));
      if (delRow) {
        const content = JSON.parse(delRow.contentJson) as { clauseSections?: ClauseDiffSection[] };
        sourceSections = content.clauseSections ?? [];
      }
    }

    if (!sourceSections.length) {
      // Fallback : premier redline de l'analyse qui a des clauseSections
      const existingRedlines = await db.select().from(deliverables)
        .where(and(eq(deliverables.analysisId, anaId), eq(deliverables.type, 'redline')));
      for (const r of existingRedlines) {
        const content = JSON.parse(r.contentJson) as { clauseSections?: ClauseDiffSection[] };
        if (content.clauseSections?.length) { sourceSections = content.clauseSections; break; }
      }
    }

    if (!sourceSections.length) {
      return res.status(400).json({
        error: 'Aucune section source à propager. Génère d\'abord un redline (audit ou comparaison).',
      });
    }

    const generatedIds: string[] = [];
    const now = new Date().toISOString();

    for (const targetId of targets) {
      const [maybeLo] = await db.select().from(legalObjects).where(eq(legalObjects.id, targetId));
      const docId = maybeLo ? maybeLo.documentId : targetId;
      const [doc] = await db.select({ fileName: documents.fileName }).from(documents).where(eq(documents.id, docId));

      // Clauses du document cible depuis la DB
      const targetClauseRows = maybeLo
        ? await db.select({ type: clauses.type, text: clauses.text, heading: clauses.heading })
            .from(clauses).where(eq(clauses.legalObjectId, maybeLo.id))
        : [];

      const { html: ckEditorHtml, sections: clauseSections } = buildMultiDocRedlineHtml(sourceSections, targetClauseRows);

      const delId = `del_red_${uuidv4().replace(/-/g, '').substring(0, 8)}`;
      await db.insert(deliverables).values({
        id: delId,
        analysisId: anaId,
        type: 'redline',
        name: `Redline propagé — ${doc?.fileName ?? targetId}`,
        createdAt: now,
        createdBy: 'ai',
        currentVersion: 1,
        status: 'draft',
        contentJson: JSON.stringify({
          type: 'redline',
          targetDocumentId: maybeLo?.id ?? docId,
          baseHtml: ckEditorHtml,
          changes: clauseSections.map((s, i) => ({
            id: `ch_${i + 1}`,
            type: 'replacement',
            originalText: s.textA,
            newText: s.textB,
            location: { startOffset: 0, endOffset: 0 },
            clauseContext: s.clauseType,
            rationale: s.recommendation ?? '',
            referenceSource: 'multi-doc',
            status: 'pending',
          })),
          comments: [],
          clauseSections,
        }),
        sourceDocumentIds: JSON.stringify([maybeLo?.id ?? docId]),
        referenceAssetIds: '[]',
        sourceOperation: 'multi_doc_redline',
      });
      generatedIds.push(delId);
    }
    res.json({ redlineIds: generatedIds });
  } catch (err) {
    console.error('[multi-doc-redline] error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Multi-doc redline failed' });
  }
});

// ─── POST /:anaId/generate-from-template ─────────────────────────────────────
// Génère un contrat complet depuis le template associé à l'analyse.
// contextNotes : description du contexte (parties, objet, montant, durée…)
// Retourne un livrable redline avec clauseSections (textA=template, textB=généré).

analysisOperationsRouter.post('/:anaId/generate-from-template', async (req, res) => {
  const { anaId } = req.params;
  const { contextNotes = '' } = req.body as { contextNotes?: string };

  try {
    const [ana] = await db.select({ referenceAssetId: analyses.referenceAssetId })
      .from(analyses).where(eq(analyses.id, anaId));
    if (!ana?.referenceAssetId) {
      return res.status(400).json({ error: 'Aucun template associé à cette analyse.' });
    }

    const [assetRow] = await db.select().from(referenceAssets)
      .where(eq(referenceAssets.id, ana.referenceAssetId));
    if (!assetRow) return res.status(404).json({ error: 'Template introuvable.' });

    const rawContent = JSON.parse(assetRow.contentJson);
    type TemplateClause = { clauseTypeOntologyId: string; sectionHeading: string; text: string; notes: string };
    let allTemplateClauses: TemplateClause[] = [];

    if (assetRow.type === 'standard') {
      const content = rawContent as StandardContent;
      if (content.sections?.length) {
        allTemplateClauses = content.sections.flatMap(sec =>
          sec.clauses.map(c => ({
            clauseTypeOntologyId: c.clauseTypeOntologyId,
            sectionHeading: sec.heading,
            text: c.text,
            notes: c.notes ?? '',
          }))
        );
      } else {
        // Legacy format: { clauses: [{ type, label, text }] }
        const legacy = rawContent as { clauses?: Array<{ type?: string; clauseTypeOntologyId?: string; label?: string; text?: string }> };
        allTemplateClauses = (legacy.clauses ?? []).map(c => ({
          clauseTypeOntologyId: c.clauseTypeOntologyId ?? c.type ?? 'clause',
          sectionHeading: c.label ?? c.type ?? 'Clause',
          text: c.text ?? '',
          notes: '',
        })).filter(c => c.text);
      }
    } else if (assetRow.type === 'playbook') {
      const content = rawContent as PlaybookContent;
      allTemplateClauses = (content.sections ?? []).map(s => ({
        clauseTypeOntologyId: s.clauseType,
        sectionHeading: s.clauseType,
        text: s.positions?.ideal?.description ?? s.positions?.fallback?.description ?? s.stakes ?? '',
        notes: s.stakes ?? '',
      })).filter(c => c.text);
    } else if (assetRow.type === 'clausier') {
      const content = rawContent as ClausierAssetContent;
      allTemplateClauses = (content.sections ?? []).map(s => ({
        clauseTypeOntologyId: s.clauseTypeOntologyId,
        sectionHeading: s.title,
        text: s.variants[0]?.text ?? '',
        notes: s.description ?? '',
      })).filter(c => c.text);
    }

    if (!allTemplateClauses.length) {
      return res.status(400).json({ error: 'Le template ne contient aucune clause.' });
    }

    // Si pas de contexte → on sert directement les clauses du template sans appel LLM
    let generated = new Map<string, string>();
    if (contextNotes.trim()) {
      const llmClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const prompt = `Tu es un juriste expert en rédaction contractuelle. Génère l'intégralité d'un contrat à partir des clauses modèles ci-dessous.

CONTEXTE DU CONTRAT (fourni par l'utilisateur) :
${contextNotes}

Pour chaque clause modèle, rédige une version concrète et complète adaptée au contexte.
Conserve la terminologie juridique et le registre formel.
Respecte l'identifiant clauseTypeOntologyId de chaque clause.

Retourne UNIQUEMENT un objet JSON valide (sans texte autour) :
{
  "clauses": [
    { "clauseTypeOntologyId": "identifiant", "generatedText": "texte rédigé de la clause" }
  ]
}

CLAUSES MODÈLES :
${JSON.stringify(allTemplateClauses, null, 2)}`;

      const message = await llmClient.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      });

      const raw = message.content.find(b => b.type === 'text')?.text ?? '{}';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) as { clauses: Array<{ clauseTypeOntologyId: string; generatedText: string }> } : { clauses: [] };
      generated = new Map(parsed.clauses.map(c => [c.clauseTypeOntologyId, c.generatedText]));
    }

    // Construire clauseSections + HTML avec diff algorithmique
    const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const clauseSections: ClauseDiffSection[] = [];
    let html = '<div class="ck-content redline-document">';

    for (const c of allTemplateClauses) {
      const textA = c.text.trim();
      // Sans contexte : textB = textA (clauses servies telles quelles)
      const textB = (generated.get(c.clauseTypeOntologyId) ?? textA).trim();
      if (!textB) continue;

      html += `<h3 class="rdl-clause-heading">${escHtml(c.sectionHeading)}</h3>`;
      const diffHtml = wordLevelDiff(textA, textB, 'major');
      clauseSections.push({
        clauseType: c.clauseTypeOntologyId,
        textA,
        textB,
        diffHtml,
        recommendation: c.notes || undefined,
        severity: 'major',
        gap: 'substantive',
      });

      html += `<section class="rdl-clause rdl-major" data-type="${escHtml(c.clauseTypeOntologyId)}" data-gap="substantive">`;
      html += `<p>${diffHtml}</p>`;
      if (c.notes) html += `<p class="rdl-recommendation">${escHtml(c.notes)}</p>`;
      html += '</section>\n';
    }
    html += '</div>';

    const now = new Date().toISOString();
    const delId = `del_red_${uuidv4().replace(/-/g, '').substring(0, 8)}`;

    // Supprimer l'éventuel livrable précédent pour cette opération
    await db.delete(deliverables).where(
      and(eq(deliverables.analysisId, anaId), eq(deliverables.sourceOperation, 'template_contract'))
    );

    await db.insert(deliverables).values({
      id: delId,
      analysisId: anaId,
      type: 'redline',
      name: `Contrat généré — ${assetRow.name}`,
      createdAt: now,
      createdBy: 'ai',
      currentVersion: 1,
      status: 'draft',
      contentJson: JSON.stringify({
        type: 'redline',
        targetDocumentId: assetRow.id,
        baseHtml: html,
        changes: clauseSections.map((s, i) => ({
          id: `ch_${i + 1}`,
          type: 'replacement',
          originalText: s.textA,
          newText: s.textB,
          location: { startOffset: 0, endOffset: 0 },
          clauseContext: s.clauseType,
          rationale: 'Généré depuis le template',
          referenceSource: assetRow.name,
          status: 'pending',
        })),
        comments: [],
        clauseSections,
      }),
      sourceDocumentIds: '[]',
      referenceAssetIds: JSON.stringify([assetRow.id]),
      sourceOperation: 'template_contract',
    });

    await db.update(analyses).set({ lastActivityAt: now }).where(eq(analyses.id, anaId));

    res.json({ deliverableId: delId, clauseCount: clauseSections.length });
  } catch (err) {
    console.error('[generate-from-template] error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Génération échouée' });
  }
});

// ─── POST /:anaId/refine-clause ───────────────────────────────────────────────
// Generates a revised clause text from a user instruction (AI-assisted editing)
analysisOperationsRouter.post('/:anaId/refine-clause', async (req, res) => {
  const { clauseType, textA, textB, userPrompt } = req.body as {
    clauseType: string;
    textA: string;
    textB: string;
    userPrompt: string;
  };
  if (!userPrompt?.trim()) return res.status(400).json({ error: 'userPrompt requis' });

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Tu es un juriste expert. Révise la clause contractuelle suivante selon l'instruction donnée.

TYPE DE CLAUSE : ${clauseType}

TEXTE ORIGINAL (document cible) :
${textA || '(absent)'}

PROPOSITION DE RÉFÉRENCE :
${textB || '(absent)'}

INSTRUCTION :
${userPrompt}

Retourne UNIQUEMENT un objet JSON :
{"proposedText": "texte révisé de la clause"}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = message.content.find(b => b.type === 'text')?.text ?? '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    res.json({ proposedText: parsed.proposedText ?? '' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Génération échouée' });
  }
});
