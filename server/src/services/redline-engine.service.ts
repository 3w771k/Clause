// RedlineEngine mutualisé (Brief 8) — un seul moteur pour les 4 cas :
// audit, comparison, contract_draft, multi_doc.
// Chaque cas a son prompt dédié dans redline-prompts/.

import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { redlines } from '../db/schema.js';
import { buildAuditPrompt } from './redline-prompts/audit.js';
import { buildComparisonPrompt } from './redline-prompts/comparison.js';
import { buildContractDraftPrompt } from './redline-prompts/contract_draft.js';
import { buildMultiDocPrompt } from './redline-prompts/multi_doc.js';
import type { PlaybookContent, StandardContent } from '../schemas/asset-content.schema.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface RedlineProposal {
  id: string;
  clauseId?: string;
  clauseTypeOntologyId?: string;
  action: 'insert' | 'delete' | 'replace' | 'comment';
  originalText: string;
  proposedText: string;
  rationale: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  deviatesFromAssetId?: string;
  deviatesFromElementId?: string;
  accepted?: boolean;
  rejectedReason?: string;
}

export interface RedlineResult {
  id: string;
  analysisId: string;
  sourceDocumentId: string;
  sourceLegalObjectId?: string;
  producedBy: 'audit' | 'comparison' | 'contract_draft' | 'multi_doc';
  producedFromId: string;
  baseTextSnapshot: string;
  proposals: RedlineProposal[];
  comments: string[];
  ckEditorHtml: string;
  status: 'draft' | 'reviewing' | 'accepted' | 'rejected';
  createdAt?: string;
  lastUpdatedAt?: string;
}

export interface RedlineEngineInput {
  analysisId: string;
  sourceDocumentId: string;
  sourceLegalObjectId?: string;
  producedBy: 'audit' | 'comparison' | 'contract_draft' | 'multi_doc';
  producedFromId: string;
  documentText: string;
  // audit
  playbookContent?: PlaybookContent;
  playbookAssetId?: string;
  // comparison
  referenceDocumentText?: string;
  referenceLegalObjectId?: string;
  // contract_draft
  standardContent?: StandardContent;
  standardAssetId?: string;
  contextNotes?: string;
  // multi_doc
  sourceRedline?: RedlineResult | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCkEditorHtml(baseText: string, proposals: RedlineProposal[]): string {
  let html = `<div class="ck-content redline-document">`;
  const paragraphs = baseText.split('\n\n').filter(p => p.trim());
  html += paragraphs.map(p => `<p>${escapeHtml(p.trim())}</p>`).join('\n');
  if (proposals.length > 0) {
    html += `\n<div class="redline-proposals">`;
    for (const p of proposals) {
      const cls = `redline-${p.severity}`;
      if (p.action === 'delete') {
        html += `\n<p><del class="${cls} redline-del" data-proposal-id="${p.id}">${escapeHtml(p.originalText)}</del></p>`;
      } else if (p.action === 'insert') {
        html += `\n<p><ins class="${cls} redline-ins" data-proposal-id="${p.id}">${escapeHtml(p.proposedText)}</ins></p>`;
      } else if (p.action === 'replace') {
        html += `\n<p><del class="${cls} redline-del" data-proposal-id="${p.id}">${escapeHtml(p.originalText)}</del> <ins class="${cls} redline-ins" data-proposal-id="${p.id}">${escapeHtml(p.proposedText)}</ins></p>`;
      } else {
        html += `\n<p class="redline-comment ${cls}" data-proposal-id="${p.id}"><em>${escapeHtml(p.rationale)}</em></p>`;
      }
    }
    html += `\n</div>`;
  }
  html += `</div>`;
  return html;
}

async function callLlmForProposals(prompt: string): Promise<RedlineProposal[]> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content.find(b => b.type === 'text')?.text ?? '[]';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const raw = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
    return raw.map((r) => ({
      id: (r.id as string) || `rdl_${uuidv4().substring(0, 8)}`,
      clauseId: r.clauseId as string | undefined,
      clauseTypeOntologyId: r.clauseTypeOntologyId as string | undefined,
      action: (r.action as RedlineProposal['action']) || 'comment',
      originalText: (r.originalText as string) || '',
      proposedText: (r.proposedText as string) || '',
      rationale: (r.rationale as string) || '',
      severity: (r.severity as RedlineProposal['severity']) || 'minor',
      deviatesFromAssetId: r.deviatesFromAssetId as string | undefined,
      deviatesFromElementId: r.deviatesFromElementId as string | undefined,
    }));
  } catch (e) {
    console.warn('[RedlineEngine] JSON parse failed', e);
    return [];
  }
}

function pickPrompt(input: RedlineEngineInput): string {
  switch (input.producedBy) {
    case 'audit':
      return buildAuditPrompt(input.documentText, input.playbookContent);
    case 'comparison':
      return buildComparisonPrompt(input.documentText, input.referenceDocumentText ?? '');
    case 'contract_draft':
      if (!input.standardContent) return buildAuditPrompt(input.documentText);
      return buildContractDraftPrompt(input.standardContent, input.contextNotes ?? '');
    case 'multi_doc':
      return buildMultiDocPrompt(input.documentText, input.sourceRedline ?? null);
  }
}

function attachAssetAncrage(proposals: RedlineProposal[], assetId: string | undefined): RedlineProposal[] {
  if (!assetId) return proposals;
  return proposals.map(p => p.deviatesFromElementId
    ? { ...p, deviatesFromAssetId: assetId }
    : p);
}

export async function generateRedline(input: RedlineEngineInput): Promise<RedlineResult> {
  const prompt = pickPrompt(input);

  let proposals: RedlineProposal[] = [];
  try {
    proposals = await callLlmForProposals(prompt);
  } catch (err) {
    console.error('[RedlineEngine] LLM call failed', err);
  }

  // Anchor proposals to playbook/standard asset for capitalisation flow (Brief 8 §6)
  if (input.producedBy === 'audit') {
    proposals = attachAssetAncrage(proposals, input.playbookAssetId);
  } else if (input.producedBy === 'contract_draft') {
    proposals = attachAssetAncrage(proposals, input.standardAssetId);
  }

  const ckEditorHtml = buildCkEditorHtml(input.documentText, proposals);
  return {
    id: `rdl_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
    analysisId: input.analysisId,
    sourceDocumentId: input.sourceDocumentId,
    sourceLegalObjectId: input.sourceLegalObjectId,
    producedBy: input.producedBy,
    producedFromId: input.producedFromId,
    baseTextSnapshot: input.documentText.substring(0, 50000),
    proposals,
    comments: [],
    ckEditorHtml,
    status: 'draft',
  };
}

// R3 — Drop la persistance dans la table `redlines` : la SSoT est la table
// `deliverables` (type=redline, contentJson). La table redlines reste dans le
// schéma pour usage futur (audit log immutable) mais n'est plus écrite ici.
// Conservé exporté pour rétro-compat appelants externes.
export async function persistRedline(result: RedlineResult): Promise<RedlineResult> {
  const [row] = await db.insert(redlines).values({
    id: result.id,
    analysisId: result.analysisId,
    sourceDocumentId: result.sourceDocumentId,
    sourceLegalObjectId: result.sourceLegalObjectId ?? null,
    producedBy: result.producedBy,
    producedFromId: result.producedFromId,
    baseTextSnapshot: result.baseTextSnapshot,
    proposalsJson: JSON.stringify(result.proposals),
    commentsJson: JSON.stringify(result.comments),
    status: result.status,
  }).returning();
  return { ...result, id: row.id, createdAt: row.createdAt };
}

// Alias rétro-compat
export const runRedlineEngine = generateRedline;
