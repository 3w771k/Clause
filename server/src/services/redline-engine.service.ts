import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { redlines } from '../db/schema.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface RedlineProposal {
  id: string;
  clauseId?: string;
  clauseType?: string;
  action: 'insert' | 'delete' | 'replace' | 'comment';
  originalText: string;
  proposedText: string;
  rationale: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  accepted?: boolean;
}

export interface RedlineResult {
  id: string;
  analysisId: string;
  sourceDocumentId: string;
  sourceLegalObjectId?: string;
  producedBy: string;
  producedFromId: string;
  baseTextSnapshot: string;
  proposals: RedlineProposal[];
  comments: string[];
  ckEditorHtml: string;
  status: string;
}

export interface RedlineEngineInput {
  analysisId: string;
  sourceDocumentId: string;
  sourceLegalObjectId?: string;
  producedBy: 'audit' | 'comparison' | 'contract_draft' | 'multi_doc';
  producedFromId: string;
  documentText: string;
  referenceText?: string;
  instruction?: string;
  context?: string;
}

const AUDIT_PROMPT = (docText: string, context?: string) => `
You are a senior legal counsel reviewing a contract. Your task is to produce precise redline proposals (tracked changes) for the following document.

${context ? `Context: ${context}\n` : ''}

Document to review:
<document>
${docText.substring(0, 12000)}
</document>

Produce a JSON array of redline proposals. Each proposal must have:
- id: unique string (format "rdl_XXXX")
- action: "insert" | "delete" | "replace" | "comment"
- originalText: the exact text from the document to change (empty string for insertions)
- proposedText: the replacement or addition (empty string for deletions)
- rationale: concise legal justification in French (max 2 sentences)
- severity: "critical" | "major" | "minor" | "info"

Focus on: liability caps, unfavorable termination conditions, IP ownership, payment terms anomalies, missing standard clauses.
Return only the JSON array, no wrapper object.
`;

const COMPARISON_PROMPT = (docText: string, refText: string) => `
You are a senior legal counsel comparing a contract against a reference standard.

Reference standard (firm's approved template):
<reference>
${refText.substring(0, 6000)}
</reference>

Document under review:
<document>
${docText.substring(0, 6000)}
</document>

Identify deviations from the reference standard and produce redline proposals to bring the document closer to the standard where beneficial. Return a JSON array of proposals with:
- id: unique string (format "rdl_XXXX")
- action: "insert" | "delete" | "replace" | "comment"
- originalText: exact text from the reviewed document (empty string for insertions)
- proposedText: text from the reference standard or improved version (empty string for deletions)
- rationale: explain the deviation and why the change is recommended (French, max 2 sentences)
- severity: "critical" | "major" | "minor" | "info"

Return only the JSON array.
`;

function buildCkEditorHtml(baseText: string, proposals: RedlineProposal[]): string {
  let html = `<div class="ck-content redline-document">`;

  // Simple approach: render base text as paragraphs, then append tracked changes summary
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

  const raw = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
  return raw.map((r, i) => ({
    id: (r.id as string) || `rdl_${uuidv4().substring(0, 8)}`,
    clauseId: r.clauseId as string | undefined,
    clauseType: r.clauseType as string | undefined,
    action: (r.action as RedlineProposal['action']) || 'comment',
    originalText: (r.originalText as string) || '',
    proposedText: (r.proposedText as string) || '',
    rationale: (r.rationale as string) || '',
    severity: (r.severity as RedlineProposal['severity']) || 'minor',
  }));
}

export async function runRedlineEngine(input: RedlineEngineInput): Promise<RedlineResult> {
  const { analysisId, sourceDocumentId, sourceLegalObjectId, producedBy, producedFromId, documentText, referenceText, instruction, context } = input;

  let prompt: string;
  if (producedBy === 'comparison' && referenceText) {
    prompt = COMPARISON_PROMPT(documentText, referenceText);
  } else {
    prompt = AUDIT_PROMPT(documentText, context ?? instruction);
  }

  let proposals: RedlineProposal[] = [];
  try {
    proposals = await callLlmForProposals(prompt);
  } catch (err) {
    console.error('[RedlineEngine] LLM call failed, returning empty proposals', err);
  }

  const ckEditorHtml = buildCkEditorHtml(documentText, proposals);
  const id = `rdl_${uuidv4().replace(/-/g, '').substring(0, 12)}`;

  const [row] = await db.insert(redlines).values({
    id,
    analysisId,
    sourceDocumentId,
    sourceLegalObjectId: sourceLegalObjectId ?? null,
    producedBy,
    producedFromId,
    baseTextSnapshot: documentText.substring(0, 50000),
    proposalsJson: JSON.stringify(proposals),
    commentsJson: '[]',
    status: 'draft',
  }).returning();

  return {
    id: row.id,
    analysisId: row.analysisId,
    sourceDocumentId: row.sourceDocumentId,
    sourceLegalObjectId: row.sourceLegalObjectId ?? undefined,
    producedBy: row.producedBy,
    producedFromId: row.producedFromId,
    baseTextSnapshot: row.baseTextSnapshot,
    proposals,
    comments: [],
    ckEditorHtml,
    status: row.status,
  };
}
