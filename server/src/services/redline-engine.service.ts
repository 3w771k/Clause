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

// ─── Word-level LCS diff ──────────────────────────────────────────────────────

export function wordLevelDiff(textA: string, textB: string, severity = 'major'): string {
  const tokenize = (s: string): string[] => s.match(/\S+|\s+/g) ?? [];
  const A = tokenize(textA);
  const B = tokenize(textB);
  const m = A.length, n = B.length;

  // LCS DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = A[i-1] === B[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);

  // Traceback
  const ops: Array<{ type: 'eq' | 'del' | 'ins'; text: string }> = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && A[i-1] === B[j-1]) { ops.unshift({ type: 'eq', text: A[i-1] }); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { ops.unshift({ type: 'ins', text: B[j-1] }); j--; }
    else { ops.unshift({ type: 'del', text: A[i-1] }); i--; }
  }

  // Merge consecutive same-type ops
  const merged: typeof ops = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last?.type === op.type) last.text += op.text;
    else merged.push({ ...op });
  }

  return merged.map(op => {
    const t = escapeHtml(op.text);
    if (op.type === 'eq') return t;
    if (op.type === 'del') return `<del class="rdl-del rdl-${severity}">${t}</del>`;
    return `<ins class="rdl-ins rdl-${severity}">${t}</ins>`;
  }).join('');
}

// ─── Build comparison redline HTML from clauseComparison (algorithmic) ────────

export interface ClauseDiffSection {
  clauseType: string;
  textA: string;       // original clause text from target document
  textB: string;       // reference clause text (initial proposed)
  diffHtml: string;
  recommendation?: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  gap: string;
}

export function buildComparisonRedlineHtml(
  clauseComparison: Array<{
    clauseType: string;
    documentA?: { text?: string | null } | null;
    documentB?: { text?: string | null } | null;
    gap?: string | null;
    severity?: string | null;
    recommendation?: string | null;
    commentary?: string | null;
  }>,
  onlyInA: string[] = [],
  onlyInB: string[] = [],
): { html: string; sections: ClauseDiffSection[] } {
  const sevMap: Record<string, ClauseDiffSection['severity']> = {
    blocking: 'critical', major: 'major', minor: 'minor', ok: 'info',
  };

  const sections: ClauseDiffSection[] = [];
  let html = '<div class="ck-content redline-document">';

  for (const cc of clauseComparison) {
    const sev = sevMap[cc.severity ?? ''] ?? 'minor';
    const textA = (cc.documentA?.text ?? '').trim();
    const textB = (cc.documentB?.text ?? '').trim();
    const gap = cc.gap ?? 'none';

    let diffHtml: string;
    if (gap === 'none' || gap === 'equivalent') {
      diffHtml = textA ? escapeHtml(textA) : '';
    } else if (gap === 'missing') {
      diffHtml = textB ? `<ins class="rdl-ins rdl-${sev}">${escapeHtml(textB)}</ins>` : '';
    } else if (textA && textB) {
      diffHtml = wordLevelDiff(textA, textB, sev);
    } else if (textA) {
      diffHtml = `<del class="rdl-del rdl-${sev}">${escapeHtml(textA)}</del>`;
    } else if (textB) {
      diffHtml = `<ins class="rdl-ins rdl-${sev}">${escapeHtml(textB)}</ins>`;
    } else {
      diffHtml = '';
    }

    const recommendation = (cc as Record<string, unknown>).recommendation as string | undefined
      ?? cc.commentary ?? undefined;

    if (gap !== 'none' && gap !== 'equivalent' && diffHtml) {
      sections.push({ clauseType: cc.clauseType, textA, textB, diffHtml, recommendation, severity: sev, gap });
    }

    html += `<section class="rdl-clause" data-type="${escapeHtml(cc.clauseType)}" data-gap="${gap}">`;
    html += `<h3 class="rdl-clause-heading">${escapeHtml(cc.clauseType)}</h3>`;
    if (diffHtml) html += `<p>${diffHtml}</p>`;
    if (recommendation) html += `<p class="rdl-recommendation">${escapeHtml(recommendation)}</p>`;
    html += '</section>\n';
  }

  for (const t of onlyInB) {
    sections.push({ clauseType: t, textA: '', textB: '', diffHtml: '', recommendation: 'Clause présente dans la référence, absente du document cible — à insérer.', severity: 'major', gap: 'missing' });
    html += `<section class="rdl-clause rdl-clause-missing" data-type="${escapeHtml(t)}" data-gap="missing">`;
    html += `<h3 class="rdl-clause-heading">${escapeHtml(t)} <span class="rdl-badge rdl-badge-missing">Manquant</span></h3>`;
    html += `<p class="rdl-recommendation">Clause présente dans la référence mais absente du document cible.</p>`;
    html += '</section>\n';
  }

  for (const t of onlyInA) {
    html += `<section class="rdl-clause rdl-clause-extra" data-type="${escapeHtml(t)}" data-gap="only-a">`;
    html += `<h3 class="rdl-clause-heading">${escapeHtml(t)} <span class="rdl-badge rdl-badge-extra">Hors référence</span></h3>`;
    html += `<p class="rdl-recommendation">Cette clause n'existe pas dans le document de référence.</p>`;
    html += '</section>\n';
  }

  html += '</div>';
  return { html, sections };
}

// ─── Build audit redline HTML from review note sections (algorithmic) ────────────

export function buildAuditRedlineHtml(
  sections: Array<{
    clauseType: string;
    clauseLabel: string;
    contractText: string | null;
    playbookRequirement: string | null;
    gapLevel: string;
    comment: string;
    suggestedLanguage: string | null;
  }>,
): { html: string; sections: ClauseDiffSection[] } {
  const sevMap: Record<string, ClauseDiffSection['severity']> = {
    blocking: 'critical', major: 'major', minor: 'minor', none: 'info',
  };

  const clauseSections: ClauseDiffSection[] = [];
  let html = '<div class="ck-content redline-document">';

  for (const s of sections) {
    const textA = (s.contractText ?? '').trim();
    const textB = (s.suggestedLanguage ?? '').trim();
    const sev = sevMap[s.gapLevel] ?? 'minor';
    const gap = s.gapLevel;

    if (gap === 'none' && !textA) continue;

    let diffHtml: string;
    if (gap === 'none') {
      diffHtml = escapeHtml(textA);
    } else if (!textA && textB) {
      diffHtml = `<ins class="rdl-ins rdl-${sev}">${escapeHtml(textB)}</ins>`;
    } else if (textA && !textB) {
      diffHtml = `<del class="rdl-del rdl-${sev}">${escapeHtml(textA)}</del>`;
    } else if (textA && textB) {
      diffHtml = wordLevelDiff(textA, textB, sev);
    } else {
      continue;
    }

    if (gap !== 'none') {
      clauseSections.push({ clauseType: s.clauseType, textA, textB, diffHtml, recommendation: s.comment || undefined, severity: sev, gap });
    }

    html += `<section class="rdl-clause rdl-${sev}" data-type="${escapeHtml(s.clauseType)}" data-gap="${gap}">`;
    html += `<h3 class="rdl-clause-heading">${escapeHtml(s.clauseLabel)}</h3>`;
    if (diffHtml) html += `<p>${diffHtml}</p>`;
    if (s.comment) html += `<p class="rdl-recommendation">${escapeHtml(s.comment)}</p>`;
    html += '</section>\n';
  }

  html += '</div>';
  return { html, sections: clauseSections };
}

// ─── Build multi-doc redline HTML (propagate source changes to target clauses) ──

export function buildMultiDocRedlineHtml(
  sourceSections: ClauseDiffSection[],
  targetClauses: Array<{ type: string; text: string; heading?: string | null }>,
): { html: string; sections: ClauseDiffSection[] } {
  const clauseSections: ClauseDiffSection[] = [];
  let html = '<div class="ck-content redline-document">';

  for (const source of sourceSections) {
    const match = targetClauses.find(c => c.type === source.clauseType);
    if (!match) continue;

    const textA = match.text.trim();
    const textB = source.textB.trim();
    if (!textA && !textB) continue;

    const sev = source.severity;
    let diffHtml: string;
    if (!textA && textB) {
      diffHtml = `<ins class="rdl-ins rdl-${sev}">${escapeHtml(textB)}</ins>`;
    } else if (textA && !textB) {
      diffHtml = `<del class="rdl-del rdl-${sev}">${escapeHtml(textA)}</del>`;
    } else {
      diffHtml = wordLevelDiff(textA, textB, sev);
    }

    clauseSections.push({ clauseType: source.clauseType, textA, textB, diffHtml, recommendation: source.recommendation, severity: sev, gap: source.gap });

    html += `<section class="rdl-clause rdl-${sev}" data-type="${escapeHtml(source.clauseType)}" data-gap="${source.gap}">`;
    html += `<h3 class="rdl-clause-heading">${escapeHtml(source.clauseType)}</h3>`;
    if (diffHtml) html += `<p>${diffHtml}</p>`;
    if (source.recommendation) html += `<p class="rdl-recommendation">${escapeHtml(source.recommendation)}</p>`;
    html += '</section>\n';
  }

  html += '</div>';
  return { html, sections: clauseSections };
}

function buildCkEditorHtml(baseText: string, proposals: RedlineProposal[]): string {
  // Find each proposal's originalText in the base text and record its position.
  // We then do a single-pass replacement so overlapping matches are handled cleanly.
  interface Replacement { start: number; end: number; html: string }
  const replacements: Replacement[] = [];
  const unmatched: RedlineProposal[] = [];

  for (const p of proposals) {
    const orig = p.originalText?.trim();
    if ((p.action === 'replace' || p.action === 'delete') && orig) {
      const idx = baseText.indexOf(orig);
      if (idx !== -1) {
        const del = `<del class="rdl-del rdl-${p.severity}" data-pid="${p.id}">${escapeHtml(orig)}</del>`;
        const ins = p.action === 'replace' && p.proposedText
          ? `<ins class="rdl-ins rdl-${p.severity}" data-pid="${p.id}">${escapeHtml(p.proposedText)}</ins>`
          : '';
        replacements.push({ start: idx, end: idx + orig.length, html: del + ins });
      } else {
        unmatched.push(p);
      }
    } else {
      unmatched.push(p);
    }
  }

  // Sort by position, discard overlapping (keep first match)
  replacements.sort((a, b) => a.start - b.start);
  const nonOverlapping: Replacement[] = [];
  let lastEnd = 0;
  for (const r of replacements) {
    if (r.start >= lastEnd) { nonOverlapping.push(r); lastEnd = r.end; }
  }

  // Build marked text with inline del/ins
  let markedText = '';
  let pos = 0;
  for (const r of nonOverlapping) {
    markedText += escapeHtml(baseText.slice(pos, r.start));
    markedText += r.html; // already escaped inside del/ins
    pos = r.end;
  }
  markedText += escapeHtml(baseText.slice(pos));

  // Convert marked text to HTML, recognising structured clause format (## / ---)
  const lines = markedText.split('\n');
  const htmlParts: string[] = [];
  let currentParaLines: string[] = [];

  const flushPara = () => {
    if (currentParaLines.length === 0) return;
    const content = currentParaLines.join('<br>').trim();
    if (content) htmlParts.push(`<p>${content}</p>`);
    currentParaLines = [];
  };

  for (const line of lines) {
    // ## TYPE: Heading — emitted by buildStructuredClauseText
    if (line.startsWith('## ')) {
      flushPara();
      htmlParts.push(`<h3 class="rdl-clause-heading">${line.slice(3)}</h3>`);
    } else if (line.trim() === '---') {
      flushPara();
      htmlParts.push('<hr class="rdl-separator">');
    } else if (!line.trim()) {
      flushPara();
    } else {
      currentParaLines.push(line);
    }
  }
  flushPara();

  let html = `<div class="ck-content redline-document">\n${htmlParts.join('\n')}`;

  // Append proposals that couldn't be inlined (inserts without anchor, unmatched replaces)
  if (unmatched.length > 0) {
    html += `\n<div class="rdl-appendix">`;
    for (const p of unmatched) {
      if (p.action === 'insert') {
        html += `\n<p><ins class="rdl-ins rdl-${p.severity}" data-pid="${p.id}">${escapeHtml(p.proposedText)}</ins></p>`;
      } else if (p.action === 'replace') {
        html += `\n<p><del class="rdl-del rdl-${p.severity}" data-pid="${p.id}">${escapeHtml(p.originalText)}</del><ins class="rdl-ins rdl-${p.severity}" data-pid="${p.id}">${escapeHtml(p.proposedText)}</ins></p>`;
      } else if (p.action === 'delete') {
        html += `\n<p><del class="rdl-del rdl-${p.severity}" data-pid="${p.id}">${escapeHtml(p.originalText)}</del></p>`;
      } else {
        html += `\n<p class="rdl-comment rdl-${p.severity}" data-pid="${p.id}"><em>${escapeHtml(p.rationale)}</em></p>`;
      }
    }
    html += `\n</div>`;
  }

  html += `\n</div>`;
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
