// Contract Composer — édition clause par clause assistée par LLM.
// Modèle : un deliverable type='contract_draft' qui stocke l'état du composer
// (workingText par clause + pending proposals + history). À chaque tour de chat
// l'user pointe une clause et donne une instruction → LLM produit des proposals
// ciblées sur le texte de cette clause uniquement.
//
// Mounted at /api/analyses/:anaId/contract-composer.

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import {
  analyses, analysisDocuments, deliverables, legalObjects, clauses, documents, referenceAssets,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const contractComposerRouter = Router();

interface ComposerProposal {
  id: string;
  action: 'replace' | 'insert' | 'delete' | 'comment';
  originalText: string;
  proposedText: string;
  rationale: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
}

interface ComposerClause {
  id: string;
  type: string;
  heading: string | null;
  sequenceNumber: string | null;
  baseText: string;
  workingText: string;
  pendingProposals: ComposerProposal[];
}

interface ComposerHistoryTurn {
  id: string;
  ts: string;
  role: 'user' | 'system';
  content: string;
  clauseId?: string;
}

interface ComposerState {
  type: 'contract_composer';
  schemaVersion: 1;
  sourceDocumentId: string;
  sourceDocumentName: string;
  clauses: ComposerClause[];
  standardId?: string | null;
  history: ComposerHistoryTurn[];
}

const COMPOSER_DELIVERABLE_TYPE = 'contract_draft';

async function loadComposerDeliverable(anaId: string) {
  const [d] = await db.select().from(deliverables)
    .where(and(eq(deliverables.analysisId, anaId), eq(deliverables.type, COMPOSER_DELIVERABLE_TYPE)));
  return d ?? null;
}

async function saveComposerState(anaId: string, state: ComposerState, existingId?: string) {
  const now = new Date().toISOString();
  if (existingId) {
    await db.update(deliverables).set({
      contentJson: JSON.stringify(state),
      currentVersion: 2,  // simple bump
    }).where(eq(deliverables.id, existingId));
    return existingId;
  }
  const id = `del_cmp_${uuidv4().replace(/-/g, '').substring(0, 8)}`;
  await db.insert(deliverables).values({
    id,
    analysisId: anaId,
    type: COMPOSER_DELIVERABLE_TYPE,
    name: `Contrat — ${state.sourceDocumentName}`,
    createdAt: now,
    createdBy: 'ai',
    currentVersion: 1,
    status: 'draft',
    contentJson: JSON.stringify(state),
    sourceDocumentIds: JSON.stringify([state.sourceDocumentId]),
    referenceAssetIds: state.standardId ? JSON.stringify([state.standardId]) : '[]',
    sourceOperation: 'contract_draft',
  });
  return id;
}

// GET / — get or initialize composer state from the source doc's extracted clauses
contractComposerRouter.get('/:anaId/contract-composer', async (req, res) => {
  const { anaId } = req.params;
  const existing = await loadComposerDeliverable(anaId);
  if (existing) {
    try {
      return res.json({ state: JSON.parse(existing.contentJson), deliverableId: existing.id });
    } catch { /* corrupted, re-init */ }
  }

  // Init from source doc
  const adRows = await db.select().from(analysisDocuments)
    .where(eq(analysisDocuments.analysisId, anaId));
  const target = adRows.find(r => r.role === 'target') ?? adRows[0];
  if (!target) return res.status(400).json({ error: 'Aucun document source dans cette analyse' });

  const [lo] = await db.select().from(legalObjects).where(eq(legalObjects.id, target.legalObjectId));
  if (!lo) return res.status(404).json({ error: 'Legal object introuvable' });
  const [doc] = await db.select().from(documents).where(eq(documents.id, lo.documentId));
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });

  const cls = await db.select({
    id: clauses.id, type: clauses.type, heading: clauses.heading,
    sequenceNumber: clauses.sequenceNumber, text: clauses.text,
  }).from(clauses).where(eq(clauses.legalObjectId, lo.id))
    .orderBy(clauses.clauseOrder);

  const state: ComposerState = {
    type: 'contract_composer',
    schemaVersion: 1,
    sourceDocumentId: doc.id,
    sourceDocumentName: doc.fileName,
    clauses: cls.map(c => ({
      id: c.id,
      type: c.type,
      heading: c.heading,
      sequenceNumber: c.sequenceNumber,
      baseText: c.text,
      workingText: c.text,
      pendingProposals: [],
    })),
    standardId: null,
    history: [],
  };
  const deliverableId = await saveComposerState(anaId, state);
  res.json({ state, deliverableId });
});

// POST /edit-clause body { clauseId, instruction, standardId? }
// Produit des proposals ciblées sur cette clause via LLM
contractComposerRouter.post('/:anaId/contract-composer/edit-clause', async (req, res) => {
  const { anaId } = req.params;
  const { clauseId, instruction, standardId } = req.body as {
    clauseId: string; instruction: string; standardId?: string | null;
  };
  if (!clauseId || !instruction?.trim()) return res.status(400).json({ error: 'clauseId et instruction requis' });

  const existing = await loadComposerDeliverable(anaId);
  if (!existing) return res.status(404).json({ error: 'Composer non initialisé. GET d\'abord.' });
  const state: ComposerState = JSON.parse(existing.contentJson);

  const clause = state.clauses.find(c => c.id === clauseId);
  if (!clause) return res.status(404).json({ error: 'Clause introuvable' });

  // Optionnel : récupérer la clause de référence du Standard pour guidance
  let standardClauseRef: string | null = null;
  if (standardId) {
    const [asset] = await db.select().from(referenceAssets).where(eq(referenceAssets.id, standardId));
    if (asset?.type === 'standard') {
      try {
        const sc = JSON.parse(asset.contentJson) as { sections?: Array<{ clauses?: Array<{ clauseTypeOntologyId?: string; text: string }> }> };
        for (const sec of sc.sections ?? []) {
          for (const c of sec.clauses ?? []) {
            if (c.clauseTypeOntologyId === clause.type) { standardClauseRef = c.text; break; }
          }
          if (standardClauseRef) break;
        }
      } catch { /* skip */ }
      state.standardId = standardId;
    }
  }

  const prompt = `Tu es un avocat senior qui reformule une clause juridique selon une instruction.

CLAUSE ACTUELLE (type: ${clause.type}${clause.heading ? `, "${clause.heading}"` : ''}) :
<clause>
${clause.workingText}
</clause>

${standardClauseRef ? `RÉFÉRENCE (clause type équivalente du standard, à titre indicatif) :
<reference>
${standardClauseRef}
</reference>

` : ''}INSTRUCTION DE L'UTILISATEUR :
${instruction}

INSTRUCTIONS :
- Produis 1 à 5 propositions de modification (track-changes) qui appliquent l'instruction à la clause.
- Chaque proposal cible un EXTRAIT verbatim de la clause actuelle.
- Réponds dans la langue de la clause.

FORMAT — UNIQUEMENT JSON, pas de wrapper :
[
  {
    "id": "p_001",
    "action": "replace",
    "originalText": "extrait verbatim à modifier",
    "proposedText": "nouveau texte",
    "rationale": "Justification courte (1 phrase).",
    "severity": "major"
  }
]

Valeurs autorisées :
- action : "replace" | "insert" | "delete" | "comment"
- severity : "critical" | "major" | "minor" | "info"
- originalText : "" pour insert
- proposedText : "" pour delete`;

  let proposals: ComposerProposal[] = [];
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content.find(b => b.type === 'text')?.text ?? '[]';
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const raw = JSON.parse(match[0]) as Array<Record<string, unknown>>;
      proposals = raw.map((r) => ({
        id: (r.id as string) || `p_${uuidv4().substring(0, 8)}`,
        action: (r.action as ComposerProposal['action']) || 'comment',
        originalText: (r.originalText as string) ?? '',
        proposedText: (r.proposedText as string) ?? '',
        rationale: (r.rationale as string) ?? '',
        severity: (r.severity as ComposerProposal['severity']) || 'minor',
      }));
    }
  } catch (err) {
    console.error('[contract-composer] LLM error:', err);
    return res.status(500).json({ error: 'LLM error' });
  }

  // Ajout en pending sur la clause
  clause.pendingProposals.push(...proposals);
  state.history.push({
    id: `h_${uuidv4().substring(0, 8)}`,
    ts: new Date().toISOString(),
    role: 'user',
    content: instruction,
    clauseId,
  });
  state.history.push({
    id: `h_${uuidv4().substring(0, 8)}`,
    ts: new Date().toISOString(),
    role: 'system',
    content: proposals.length > 0
      ? `${proposals.length} proposition(s) ajoutée(s).`
      : 'Aucune proposition générée — reformule ton instruction.',
    clauseId,
  });
  await saveComposerState(anaId, state, existing.id);

  res.json({ proposals, clause });
});

// POST /proposal/:proposalId/accept body { clauseId }
contractComposerRouter.post('/:anaId/contract-composer/proposal/:proposalId/accept', async (req, res) => {
  const { anaId, proposalId } = req.params;
  const { clauseId } = req.body as { clauseId: string };
  const existing = await loadComposerDeliverable(anaId);
  if (!existing) return res.status(404).json({ error: 'Composer non initialisé' });
  const state: ComposerState = JSON.parse(existing.contentJson);
  const clause = state.clauses.find(c => c.id === clauseId);
  if (!clause) return res.status(404).json({ error: 'Clause introuvable' });
  const propIdx = clause.pendingProposals.findIndex(p => p.id === proposalId);
  if (propIdx < 0) return res.status(404).json({ error: 'Proposal introuvable' });

  const prop = clause.pendingProposals[propIdx];
  // Applique au workingText
  if (prop.action === 'replace' && prop.originalText) {
    clause.workingText = clause.workingText.replace(prop.originalText, prop.proposedText);
  } else if (prop.action === 'insert' && prop.proposedText) {
    clause.workingText = `${clause.workingText}\n\n${prop.proposedText}`;
  } else if (prop.action === 'delete' && prop.originalText) {
    clause.workingText = clause.workingText.replace(prop.originalText, '');
  }
  // comment : pas d'application sur le texte

  clause.pendingProposals.splice(propIdx, 1);
  await saveComposerState(anaId, state, existing.id);
  res.json({ clause });
});

// POST /proposal/:proposalId/reject
contractComposerRouter.post('/:anaId/contract-composer/proposal/:proposalId/reject', async (req, res) => {
  const { anaId, proposalId } = req.params;
  const { clauseId } = req.body as { clauseId: string };
  const existing = await loadComposerDeliverable(anaId);
  if (!existing) return res.status(404).json({ error: 'Composer non initialisé' });
  const state: ComposerState = JSON.parse(existing.contentJson);
  const clause = state.clauses.find(c => c.id === clauseId);
  if (!clause) return res.status(404).json({ error: 'Clause introuvable' });
  clause.pendingProposals = clause.pendingProposals.filter(p => p.id !== proposalId);
  await saveComposerState(anaId, state, existing.id);
  res.json({ clause });
});

// POST /reset — réinitialise depuis l'extraction (perd les modifs)
contractComposerRouter.post('/:anaId/contract-composer/reset', async (req, res) => {
  const { anaId } = req.params;
  const existing = await loadComposerDeliverable(anaId);
  if (existing) {
    await db.delete(deliverables).where(eq(deliverables.id, existing.id));
  }
  res.json({ ok: true });
});
