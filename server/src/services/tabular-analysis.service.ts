// Tabular Analysis (Brief A) — analyses post-extraction sur une review tabulaire.
// Trois primitives :
//   - analyzeColumns : pour chaque colonne, identifier les outliers cross-row
//   - analyzeRowsAgainstPlaybook : pour chaque ligne, vérdict vs playbook (optionnel)
//   - globalSynthesis : synthèse LLM 1-2 paragraphes du tableau entier
//
// Gère aussi les "consistencyRules" déclarées dans un workflow OOTB (Brief A6).

import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/index.js';
import { tabularReviews, tabularRows, tabularCells, documents, referenceAssets } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ColumnOutlier {
  rowId: string;
  documentName: string;
  value: string | null;
  reason: string;
}

export interface ColumnAnalysis {
  columnId: string;
  columnLabel: string;
  outliers: ColumnOutlier[];
  synthesis: string;
}

export type RowVerdictLevel = 'compliant' | 'attention' | 'risk';

export interface RowVerdict {
  rowId: string;
  documentName: string;
  verdict: RowVerdictLevel;
  rationale: string;
  brokenRules: string[];
}

export interface ConsistencyRuleResult {
  ruleId: string;
  ruleLabel: string;
  scope: 'cross_row' | 'cross_column';
  findings: string[];
}

export interface CustomCheck {
  id: string;
  prompt: string;
  createdAt: string;
}

export interface CustomCheckResult {
  checkId: string;
  prompt: string;
  findings: Array<{ rowId?: string; documentName?: string; finding: string }>;
  summary: string;
}

export interface TabularAnalysis {
  schemaVersion: 1;
  generatedAt: string;
  reviewId: string;
  columnAnalyses: ColumnAnalysis[];
  rowVerdicts?: RowVerdict[];
  globalSynthesis: string;
  playbookAssetId?: string | null;
  declaredRulesResults?: ConsistencyRuleResult[];
  customCheckResults?: CustomCheckResult[];
}

interface ReviewRow {
  rowId: string;
  documentName: string;
  cells: Record<string, { value: string | null; rawValue: string | null; confidence: string }>;
}

interface ReviewSnapshot {
  trId: string;
  columns: Array<{ id: string; label: string; question: string; expectedType: string }>;
  rows: ReviewRow[];
  playbookAssetId: string | null;
  consistencyRules?: ConsistencyRule[];
  customChecks: CustomCheck[];
}

interface ConsistencyRule {
  id: string;
  label: string;
  scope: 'cross_row' | 'cross_column';
  description: string;
  appliesToColumnIds?: string[];
}

async function loadSnapshot(trId: string): Promise<ReviewSnapshot | null> {
  const [review] = await db.select().from(tabularReviews).where(eq(tabularReviews.id, trId));
  if (!review) return null;
  const cols = JSON.parse(review.columnsJson) as Array<{ id: string; label: string; question: string; expectedType: string }>;

  const rowsRaw = await db.select({
    row: tabularRows,
    fileName: documents.fileName,
  }).from(tabularRows)
    .leftJoin(documents, eq(documents.id, tabularRows.documentId))
    .where(eq(tabularRows.tabularReviewId, trId));

  const allCells = await db.select().from(tabularCells).where(eq(tabularCells.tabularReviewId, trId));

  const rows: ReviewRow[] = rowsRaw.map(({ row, fileName }) => {
    const cells: ReviewRow['cells'] = {};
    for (const c of allCells.filter(c => c.rowId === row.id)) {
      cells[c.columnId] = { value: c.value, rawValue: c.rawValue, confidence: c.confidence };
    }
    return { rowId: row.id, documentName: fileName ?? row.documentId, cells };
  });

  // Charge les consistencyRules depuis l'asset workflow lié, si applicable
  let consistencyRules: ConsistencyRule[] | undefined;
  if (review.workflowId) {
    const wfAssetId = review.workflowId.startsWith('wf_') ? review.workflowId : `wf_${review.workflowId}`;
    const [wfAsset] = await db.select().from(referenceAssets).where(eq(referenceAssets.id, wfAssetId));
    if (wfAsset) {
      try {
        const content = JSON.parse(wfAsset.contentJson) as { consistencyRules?: ConsistencyRule[] };
        if (Array.isArray(content.consistencyRules)) consistencyRules = content.consistencyRules;
      } catch { /* skip */ }
    }
  }

  let customChecks: CustomCheck[] = [];
  if (review.customChecksJson) {
    try { customChecks = JSON.parse(review.customChecksJson); } catch { /* ignore */ }
  }

  return {
    trId,
    columns: cols,
    rows,
    playbookAssetId: review.playbookAssetId,
    consistencyRules,
    customChecks,
  };
}

async function executeCustomChecks(snap: ReviewSnapshot): Promise<CustomCheckResult[]> {
  if (!snap.customChecks.length || !snap.rows.length) return [];

  const tableBlock = snap.rows.map(r => {
    const cells = snap.columns.map(c =>
      `  ${c.label}: ${r.cells[c.id]?.value ?? '(vide)'}`,
    ).join('\n');
    return `[rowId=${r.rowId}] ${r.documentName}\n${cells}`;
  }).join('\n\n');

  const results: CustomCheckResult[] = [];
  for (const check of snap.customChecks) {
    const prompt = `Tu vérifies une règle de cohérence sur un tableau d'extraction juridique.

RÈGLE À VÉRIFIER (formulée par l'utilisateur) :
${check.prompt}

TABLEAU (${snap.rows.length} document${snap.rows.length > 1 ? 's' : ''}, ${snap.columns.length} colonne${snap.columns.length > 1 ? 's' : ''}) :
${tableBlock}

INSTRUCTIONS :
- Applique strictement la règle décrite par l'user.
- Liste chaque finding (anomalie, écart, ce que la règle pointe) avec le rowId concerné si applicable.
- Si la règle est vague, fais ton mieux pour la matérialiser.
- Si tout est conforme, retourne findings vide et un summary qui le confirme.

FORMAT — JSON UNIQUEMENT, pas de wrapper, pas de markdown :
{
  "findings": [
    { "rowId": "trow_xxx", "finding": "ce que tu as trouvé sur cette ligne" }
  ],
  "summary": "Synthèse 1 phrase de la vérification."
}`;

    const r = await llmJson<{ findings: Array<{ rowId?: string; finding: string }>; summary: string }>(
      prompt,
      { findings: [], summary: 'Vérification non disponible.' },
    );
    results.push({
      checkId: check.id,
      prompt: check.prompt,
      findings: (r.findings ?? []).map(f => {
        const row = f.rowId ? snap.rows.find(rr => rr.rowId === f.rowId) : null;
        return { rowId: f.rowId, documentName: row?.documentName, finding: f.finding };
      }),
      summary: r.summary ?? '',
    });
  }
  return results;
}

async function llmJson<T>(prompt: string, fallback: T): Promise<T> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content.find(b => b.type === 'text')?.text ?? '';
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) return fallback;
    return JSON.parse(match[0]) as T;
  } catch (err) {
    console.warn('[tabular-analysis] LLM call failed:', err);
    return fallback;
  }
}

async function analyzeColumns(snap: ReviewSnapshot): Promise<ColumnAnalysis[]> {
  if (snap.rows.length < 2) {
    // Outliers ne font pas sens à 1 ligne
    return snap.columns.map(c => ({
      columnId: c.id,
      columnLabel: c.label,
      outliers: [],
      synthesis: snap.rows.length === 0 ? 'Aucune donnée.' : `Une seule ligne — pas de comparaison cross-row.`,
    }));
  }

  const out: ColumnAnalysis[] = [];
  for (const col of snap.columns) {
    const values = snap.rows.map(r => ({
      rowId: r.rowId,
      documentName: r.documentName,
      value: r.cells[col.id]?.value ?? null,
    }));

    const valuesBlock = values.map((v, i) =>
      `${i + 1}. [rowId=${v.rowId}] ${v.documentName}: ${v.value === null ? '(vide)' : JSON.stringify(v.value)}`,
    ).join('\n');

    const prompt = `Tu analyses la cohérence d'une colonne d'un tableau d'extraction juridique.

COLONNE : "${col.label}"
QUESTION : ${col.question}

VALEURS EXTRAITES par document (${values.length} lignes) :
${valuesBlock}

INSTRUCTIONS :
1. Identifie les OUTLIERS : valeurs qui sortent du lot (différentes de la majorité, ou en contradiction sémantique).
2. Ne flag pas les variations cosmétiques (formulation différente mais sens identique).
3. Pour chaque outlier, donne le rowId et une raison courte en français.
4. Produis aussi une synthèse 1 phrase de la distribution.

FORMAT — UNIQUEMENT JSON, pas de markdown :
{
  "outliers": [
    { "rowId": "trow_xxx", "value": "valeur de cette ligne", "reason": "explication courte" }
  ],
  "synthesis": "Synthèse 1 phrase."
}`;

    const result = await llmJson<{ outliers: Array<{ rowId: string; value?: string; reason: string }>; synthesis: string }>(
      prompt,
      { outliers: [], synthesis: 'Analyse non disponible.' },
    );

    out.push({
      columnId: col.id,
      columnLabel: col.label,
      outliers: result.outliers.map(o => {
        const r = values.find(v => v.rowId === o.rowId);
        return {
          rowId: o.rowId,
          documentName: r?.documentName ?? o.rowId,
          value: r?.value ?? o.value ?? null,
          reason: o.reason,
        };
      }),
      synthesis: result.synthesis,
    });
  }
  return out;
}

async function analyzeRowsAgainstPlaybook(
  snap: ReviewSnapshot,
  playbookContent: { requirements?: Array<{ id: string; title: string; ruleText: string; criticality: string }> },
): Promise<RowVerdict[]> {
  const reqs = playbookContent.requirements ?? [];
  if (reqs.length === 0 || snap.rows.length === 0) return [];

  const reqsBlock = reqs.map(r => `- [${r.id}] ${r.criticality.toUpperCase()} — ${r.title}\n  ${r.ruleText}`).join('\n');
  const verdicts: RowVerdict[] = [];

  for (const row of snap.rows) {
    const cellsBlock = snap.columns.map(c =>
      `- ${c.label}: ${row.cells[c.id]?.value ?? '(vide)'}`,
    ).join('\n');

    const prompt = `Évalue cette ligne d'extraction juridique vs un playbook d'exigences.

DOCUMENT : ${row.documentName}

DONNÉES EXTRAITES :
${cellsBlock}

PLAYBOOK :
${reqsBlock}

INSTRUCTIONS :
1. Pour chaque exigence du playbook, vérifie si la ligne la respecte.
2. Verdict global :
   - "compliant" : toutes les exigences critical/major OK
   - "attention" : une ou plusieurs exigences minor/info en écart
   - "risk" : au moins une critical ou major en écart
3. Liste les ids des exigences enfreintes.

FORMAT — JSON UNIQUEMENT :
{
  "verdict": "compliant" | "attention" | "risk",
  "rationale": "Justification 1-2 phrases en français.",
  "brokenRules": ["req_xxx", ...]
}`;

    const result = await llmJson<{ verdict: RowVerdictLevel; rationale: string; brokenRules: string[] }>(
      prompt,
      { verdict: 'attention', rationale: 'Évaluation non disponible.', brokenRules: [] },
    );
    verdicts.push({
      rowId: row.rowId,
      documentName: row.documentName,
      verdict: result.verdict ?? 'attention',
      rationale: result.rationale ?? '',
      brokenRules: result.brokenRules ?? [],
    });
  }
  return verdicts;
}

async function globalSynthesis(snap: ReviewSnapshot, columnAnalyses: ColumnAnalysis[]): Promise<string> {
  if (snap.rows.length === 0) return 'Aucune donnée à analyser.';

  const totalOutliers = columnAnalyses.reduce((s, c) => s + c.outliers.length, 0);
  const tableSummary = snap.columns.map(c => {
    const ca = columnAnalyses.find(a => a.columnId === c.id);
    return `- ${c.label}: ${ca?.synthesis ?? ''}${ca?.outliers.length ? ` (${ca.outliers.length} outlier${ca.outliers.length > 1 ? 's' : ''})` : ''}`;
  }).join('\n');

  const prompt = `Synthèse exécutive d'une analyse tabulaire juridique.

${snap.rows.length} document${snap.rows.length > 1 ? 's' : ''} analysé${snap.rows.length > 1 ? 's' : ''} sur ${snap.columns.length} colonne${snap.columns.length > 1 ? 's' : ''}.
${totalOutliers} valeur${totalOutliers !== 1 ? 's' : ''} flaguée${totalOutliers !== 1 ? 's' : ''} comme outlier.

DISTRIBUTION PAR COLONNE :
${tableSummary}

Produis une synthèse de 2-3 phrases en français : qu'est-ce qui ressort de cette analyse ? Quels patterns ou risques majeurs ?
Réponds UNIQUEMENT avec le texte, pas de JSON ni markdown.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    return msg.content.find(b => b.type === 'text')?.text?.trim() ?? '';
  } catch {
    return 'Synthèse non disponible.';
  }
}

async function executeDeclaredRules(snap: ReviewSnapshot): Promise<ConsistencyRuleResult[]> {
  const rules = snap.consistencyRules ?? [];
  const results: ConsistencyRuleResult[] = [];
  for (const rule of rules) {
    const targetCols = rule.appliesToColumnIds?.length
      ? snap.columns.filter(c => rule.appliesToColumnIds!.includes(c.id))
      : snap.columns;

    const ctx = targetCols.map(c => {
      const vals = snap.rows.map(r => `${r.documentName}: ${r.cells[c.id]?.value ?? '(vide)'}`).join('\n  ');
      return `- ${c.label}:\n  ${vals}`;
    }).join('\n\n');

    const prompt = `Applique cette règle de cohérence sur le tableau.

RÈGLE [${rule.id}] (${rule.scope}) : ${rule.label}
Description : ${rule.description}

DONNÉES :
${ctx}

INSTRUCTIONS : retourne les findings (1 par anomalie), en français, courts.
FORMAT JSON UNIQUEMENT : { "findings": ["finding 1", "finding 2"] }`;

    const r = await llmJson<{ findings: string[] }>(prompt, { findings: [] });
    results.push({ ruleId: rule.id, ruleLabel: rule.label, scope: rule.scope, findings: r.findings ?? [] });
  }
  return results;
}

export async function runTabularAnalysis(trId: string): Promise<TabularAnalysis | null> {
  const snap = await loadSnapshot(trId);
  if (!snap) return null;

  const columnAnalyses = await analyzeColumns(snap);

  let rowVerdicts: RowVerdict[] | undefined;
  if (snap.playbookAssetId) {
    const [playbookAsset] = await db.select().from(referenceAssets).where(eq(referenceAssets.id, snap.playbookAssetId));
    if (playbookAsset?.type === 'playbook') {
      try {
        const content = JSON.parse(playbookAsset.contentJson);
        rowVerdicts = await analyzeRowsAgainstPlaybook(snap, content);
      } catch (err) {
        console.warn('[tabular-analysis] Failed to parse playbook content:', err);
      }
    }
  }

  const declaredRulesResults = snap.consistencyRules?.length
    ? await executeDeclaredRules(snap)
    : undefined;

  const customCheckResults = snap.customChecks.length
    ? await executeCustomChecks(snap)
    : undefined;

  const synthesis = await globalSynthesis(snap, columnAnalyses);

  const result: TabularAnalysis = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    reviewId: trId,
    columnAnalyses,
    rowVerdicts,
    globalSynthesis: synthesis,
    playbookAssetId: snap.playbookAssetId,
    declaredRulesResults,
    customCheckResults,
  };

  // Persiste
  await db.update(tabularReviews).set({
    analysisJson: JSON.stringify(result),
    lastAnalysisAt: result.generatedAt,
  }).where(eq(tabularReviews.id, trId));

  return result;
}

export async function getTabularAnalysis(trId: string): Promise<TabularAnalysis | null> {
  const [review] = await db.select().from(tabularReviews).where(eq(tabularReviews.id, trId));
  if (!review || !review.analysisJson) return null;
  try {
    return JSON.parse(review.analysisJson) as TabularAnalysis;
  } catch {
    return null;
  }
}

export async function setReviewPlaybook(trId: string, playbookAssetId: string | null) {
  await db.update(tabularReviews)
    .set({ playbookAssetId })
    .where(eq(tabularReviews.id, trId));
}

export async function listCustomChecks(trId: string): Promise<CustomCheck[]> {
  const [r] = await db.select().from(tabularReviews).where(eq(tabularReviews.id, trId));
  if (!r?.customChecksJson) return [];
  try { return JSON.parse(r.customChecksJson); } catch { return []; }
}

export async function addCustomCheck(trId: string, prompt: string): Promise<CustomCheck> {
  const list = await listCustomChecks(trId);
  const check: CustomCheck = {
    id: 'chk_' + Math.random().toString(36).substring(2, 10),
    prompt: prompt.trim().slice(0, 1000),
    createdAt: new Date().toISOString(),
  };
  list.push(check);
  await db.update(tabularReviews)
    .set({ customChecksJson: JSON.stringify(list) })
    .where(eq(tabularReviews.id, trId));
  return check;
}

export async function deleteCustomCheck(trId: string, checkId: string): Promise<void> {
  const list = (await listCustomChecks(trId)).filter(c => c.id !== checkId);
  await db.update(tabularReviews)
    .set({ customChecksJson: JSON.stringify(list) })
    .where(eq(tabularReviews.id, trId));
}
