import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import {
  analyses, analysisDocuments, conversationMessages, deliverables,
  legalObjects, clauses, referenceAssets, documents,
} from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { llm } from '../llm/index.js';
import { NluIntentSchema } from '../types/api.js';
import type { NluIntent, ComparativeNoteContent, RedlineContent, ReviewNoteContent, ClausierContent, MaTableContent, DeadlinesTableContent, ComplianceNoteContent, InconsistenciesReportContent } from '../types/api.js';
import { extractStructuredFields } from '../routes/tcd.js';

// Passthrough "schema" — mock provider returns raw objects, not Zod-validated
const passthrough = { parse: (v: unknown) => v } as unknown as import('zod').ZodSchema<unknown>;

// ─── NLU Intent parsing ────────────────────────────────────────────────────────

function detectIntentFromKeywords(msg: string): NluIntent['operation'] {
  const p = msg.toLowerCase();
  if (p.includes('m&a') || p.includes('fusion') || p.includes('acquisition') || p.includes('engagements hérités') || p.includes('cession') || p.includes('changement de contrôle')) return 'ma_mapping';
  if (p.includes('échéance') || p.includes('délai') || p.includes('renouvellement') || p.includes('préavis') || p.includes('temporel') || p.includes('date limite')) return 'deadlines';
  if (p.includes('conformité') || p.includes('réglementaire') || p.includes('rgpd') || p.includes('norme') || p.includes('réglement') || p.includes('compliance')) return 'compliance';
  if (p.includes('incohérence') || p.includes('inter-contrats') || p.includes('divergence') || p.includes('différence entre les contrats')) return 'inconsistencies';
  if (p.includes('compar') || p.includes('alignement') || p.includes('alignment') || p.includes('diff') || p.includes('vs ') || p.includes(' vs')) return 'alignment';
  if (p.includes('audit') || p.includes('revue') || p.includes('revoir') || p.includes('confronte') || p.includes('playbook') || p.includes('référentiel')) return 'confrontation';
  if (p.includes('clausier') || p.includes('agréger') || p.includes('extraire les clauses')) return 'aggregation';
  return 'unclear';
}

export async function parseIntent(userMessage: string, analysisContext: string): Promise<NluIntent> {
  try {
    const result = await llm.completeStructured(
      [
        {
          role: 'system',
          content: `Tu es un interpréteur d'intention pour un assistant juridique.
Retourne UNIQUEMENT un objet JSON avec cette structure exacte (pas de texte autour) :
{"operation":"alignment","targetDocuments":[],"referenceAssets":[],"deliverableTypes":["comparative_note","redline"],"clarificationNeeded":null,"confidence":"high"}

Les valeurs possibles pour "operation" sont EXACTEMENT : "alignment", "confrontation", "aggregation", "unclear", "ma_mapping", "deadlines", "compliance", "inconsistencies"
- alignment = comparer des documents entre eux
- confrontation = auditer un contrat contre un référentiel
- aggregation = constituer un clausier
- ma_mapping = cartographier les engagements hérités (M&A, fusion, acquisition)
- deadlines = détecter les échéances contractuelles
- compliance = auditer la conformité réglementaire
- inconsistencies = détecter les incohérences inter-contrats
- unclear = intention non claire

Contexte : ${analysisContext}`,
        },
        { role: 'user', content: userMessage },
      ],
      NluIntentSchema,
    );
    return result;
  } catch (err) {
    console.warn('[parseIntent] LLM failed, falling back to keyword detection:', err instanceof Error ? err.message : String(err));
    const operation = detectIntentFromKeywords(userMessage);
    const deliverableTypes = operation === 'alignment' ? ['comparative_note', 'redline']
      : operation === 'confrontation' ? ['review_note']
      : operation === 'aggregation' ? ['clausier']
      : operation === 'ma_mapping' ? ['ma_table']
      : operation === 'deadlines' ? ['deadlines_table']
      : operation === 'compliance' ? ['compliance_note']
      : operation === 'inconsistencies' ? ['inconsistencies_report']
      : [];
    return {
      operation,
      targetDocuments: [],
      referenceAssets: [],
      deliverableTypes,
      clarificationNeeded: operation === 'unclear'
        ? 'Que souhaitez-vous faire ? Comparer des documents, auditer un contrat contre un référentiel, ou constituer un clausier ?'
        : null,
      confidence: 'medium',
    };
  }
}

// ─── Get analysis context (documents names + types) ───────────────────────────

export async function getAnalysisContext(analysisId: string): Promise<string> {
  const adRows = await db.select({
    role: analysisDocuments.role,
    loId: analysisDocuments.legalObjectId,
  }).from(analysisDocuments).where(eq(analysisDocuments.analysisId, analysisId));

  if (!adRows.length) return 'Aucun document ajouté à cette analyse.';

  const parts: string[] = [];
  for (const ad of adRows) {
    const [lo] = await db.select().from(legalObjects).where(eq(legalObjects.id, ad.loId));
    if (lo) {
      const [doc] = await db.select({ fileName: documents.fileName })
        .from(documents).where(eq(documents.id, lo.documentId));
      parts.push(`[${ad.role}] ${doc?.fileName ?? lo.id} (${lo.documentSubtype ?? lo.documentType})`);
    }
  }
  return parts.join('\n');
}

// ─── Load full legal object data ───────────────────────────────────────────────

async function loadLegalObjectWithClauses(loId: string) {
  const [lo] = await db.select().from(legalObjects).where(eq(legalObjects.id, loId));
  if (!lo) return null;
  const clauseRows = await db.select().from(clauses)
    .where(eq(clauses.legalObjectId, loId))
    .orderBy(clauses.clauseOrder);
  const [doc] = await db.select({ fileName: documents.fileName })
    .from(documents).where(eq(documents.id, lo.documentId));
  return { lo, clauses: clauseRows, fileName: doc?.fileName ?? loId };
}

// ─── Alignment (comparison) ───────────────────────────────────────────────────

export async function runAlignment(analysisId: string): Promise<string[]> {
  const adRows = await db.select().from(analysisDocuments)
    .where(eq(analysisDocuments.analysisId, analysisId));

  const targets = adRows.filter((r) => r.role === 'target');
  const references = adRows.filter((r) => r.role === 'reference').length
    ? adRows.filter((r) => r.role === 'reference')
    : adRows.filter((r) => r.role !== 'target');

  const target = targets[0];
  const reference = references[0] ?? targets[1];
  if (!target || !reference) throw new Error('Alignment requires at least 2 documents');

  const [targetData, refData] = await Promise.all([
    loadLegalObjectWithClauses(target.legalObjectId),
    loadLegalObjectWithClauses(reference.legalObjectId),
  ]);
  if (!targetData || !refData) throw new Error('Could not load legal objects');

  const targetClausesSummary = targetData.clauses
    .map((c) => `[${c.type}] ${c.heading ?? c.type}: ${c.text.substring(0, 120)}`)
    .join('\n');
  const refClausesSummary = refData.clauses
    .map((c) => `[${c.type}] ${c.heading ?? c.type}: ${c.text.substring(0, 120)}`)
    .join('\n');

  const prompt = `Compare ces deux documents juridiques et identifie les écarts.

DOCUMENT CIBLE (${targetData.fileName}):
${targetClausesSummary || '(aucune clause extraite)'}

DOCUMENT RÉFÉRENCE (${refData.fileName}):
${refClausesSummary || '(aucune clause extraite)'}

Génère une note comparative exhaustive en JSON selon ce format EXACT (respecte les noms de champs à la lettre) :
{
  "type": "comparative_note",
  "synthesis": {
    "overallGapLevel": "none|minor|significant|major",
    "topGaps": ["écart 1", "écart 2"],
    "negotiationRecommendation": "recommandation globale",
    "executiveSummary": "2-3 phrases résumant les écarts principaux pour un décideur non-juriste"
  },
  "clauseComparison": [
    {
      "clauseType": "TYPE_CLAUSE",
      "documentA": { "text": "texte dans document cible ou null", "citation": null },
      "documentB": { "text": "texte dans document référence ou null", "citation": null },
      "gap": "none|equivalent|editorial|substantive|unfavorable|missing",
      "severity": "blocking|major|minor|ok",
      "recommendation": "action concrète recommandée, ex: Aligner sur 5 ans, Exiger Paris",
      "commentary": "analyse de l'écart"
    }
  ],
  "onlyInA": ["clauses présentes uniquement dans le document cible"],
  "onlyInB": ["clauses présentes uniquement dans le document référence"],
  "pointByPointRecommendations": ["recommandation 1", "recommandation 2"],
  "annexCitations": []
}`;

  const noteContent = await llm.completeStructured<ComparativeNoteContent>(
    [
      { role: 'system', content: 'Tu es un avocat expert en rédaction de notes comparatives. Retourne uniquement du JSON valide.' },
      { role: 'user', content: prompt },
    ],
    passthrough as unknown as import('zod').ZodSchema<ComparativeNoteContent>,
  );

  const redlinePrompt = `Génère un redline HTML comparant ces deux documents juridiques.

Document cible : ${targetData.fileName}
${targetClausesSummary || '(aucune clause extraite)'}

Document référence : ${refData.fileName}
${refClausesSummary || '(aucune clause extraite)'}

Retourne un JSON avec ce format EXACT :
{
  "type": "redline",
  "targetDocumentId": "${target.legalObjectId}",
  "baseHtml": "<p>HTML avec <span class=\\"del\\">texte supprimé</span> et <span class=\\"ins\\">texte ajouté</span></p>",
  "changes": [
    {
      "id": "ch_1",
      "type": "replacement",
      "originalText": "texte original",
      "newText": "nouveau texte",
      "location": { "startOffset": 0, "endOffset": 50 },
      "clauseContext": "Clause concernée",
      "rationale": "raison de la modification",
      "referenceSource": "${refData.fileName}",
      "status": "pending"
    }
  ],
  "comments": []
}`;

  const redlineContent = await llm.completeStructured<RedlineContent>(
    [
      { role: 'system', content: 'Tu es un expert en rédaction de redlines juridiques. Retourne uniquement du JSON valide.' },
      { role: 'user', content: redlinePrompt },
    ],
    passthrough as unknown as import('zod').ZodSchema<RedlineContent>,
  );

  const now = new Date().toISOString();
  const noteId = `del_note_${uuidv4().replace(/-/g, '').substring(0, 8)}`;
  const redlineId = `del_redline_${uuidv4().replace(/-/g, '').substring(0, 8)}`;

  await db.insert(deliverables).values([
    {
      id: noteId,
      analysisId,
      type: 'comparative_note',
      name: `Note comparative — ${targetData.fileName} vs ${refData.fileName}`,
      createdAt: now,
      createdBy: 'ai',
      currentVersion: 1,
      status: 'draft',
      contentJson: JSON.stringify(noteContent),
      sourceDocumentIds: JSON.stringify([target.legalObjectId, reference.legalObjectId]),
      referenceAssetIds: '[]',
      sourceOperation: 'alignment',
    },
    {
      id: redlineId,
      analysisId,
      type: 'redline',
      name: `Redline — ${targetData.fileName}`,
      createdAt: now,
      createdBy: 'ai',
      currentVersion: 1,
      status: 'draft',
      contentJson: JSON.stringify(redlineContent),
      sourceDocumentIds: JSON.stringify([target.legalObjectId, reference.legalObjectId]),
      referenceAssetIds: '[]',
      sourceOperation: 'alignment',
    },
  ]);

  await db.update(analyses)
    .set({ lastActivityAt: now })
    .where(eq(analyses.id, analysisId));

  return [noteId, redlineId];
}

// ─── Confrontation (audit against playbook) ───────────────────────────────────

export async function runConfrontation(analysisId: string): Promise<string[]> {
  const adRows = await db.select().from(analysisDocuments)
    .where(eq(analysisDocuments.analysisId, analysisId));

  const target = adRows.find((r) => r.role === 'target') ?? adRows[0];
  if (!target) throw new Error('No document for confrontation');

  const targetData = await loadLegalObjectWithClauses(target.legalObjectId);
  if (!targetData) throw new Error('Could not load legal object');

  // Load the pinned reference asset from the analysis, fallback to first available
  const [ana] = await db.select({ referenceAssetId: analyses.referenceAssetId }).from(analyses).where(eq(analyses.id, analysisId));
  const refAssets = ana?.referenceAssetId
    ? await db.select().from(referenceAssets).where(eq(referenceAssets.id, ana.referenceAssetId))
    : await db.select().from(referenceAssets).limit(1);
  const refAsset = refAssets[0];
  const refContent = refAsset ? JSON.parse(refAsset.contentJson) : { sections: [] };

  const clausesSummary = targetData.clauses
    .map((c) => `[${c.type}] ${c.heading ?? c.type}: ${c.text.substring(0, 300)}`)
    .join('\n');

  const prompt = `Audite ce contrat par rapport au playbook de référence.

CONTRAT (${targetData.fileName}) :
${clausesSummary || '(aucune clause extraite)'}

PLAYBOOK :
${JSON.stringify(refContent).substring(0, 3000)}

Génère une note de revue JSON avec ce format EXACT :
{
  "type": "review_note",
  "summary": "verdict et résumé exécutif",
  "contractDocumentId": "${target.legalObjectId}",
  "referenceAssetId": "${refAsset?.id ?? 'none'}",
  "globalVerdict": "conforme|a_negocier|non_conforme",
  "priorityPoints": ["point prioritaire 1", "point prioritaire 2"],
  "sections": [
    {
      "clauseType": "TYPE",
      "clauseLabel": "Nom lisible",
      "contractText": "texte de la clause dans le contrat ou null",
      "playbookRequirement": "exigence du playbook ou null",
      "gapLevel": "none|minor|major|blocking",
      "comment": "analyse détaillée",
      "suggestedLanguage": "formulation suggérée ou null"
    }
  ]
}`;

  const noteContent = await llm.completeStructured<ReviewNoteContent>(
    [
      { role: 'system', content: 'Tu es un avocat expert en audit de contrats. Retourne uniquement du JSON valide.' },
      { role: 'user', content: prompt },
    ],
    passthrough as unknown as import('zod').ZodSchema<ReviewNoteContent>,
  );

  const now = new Date().toISOString();
  const noteId = `del_rev_${uuidv4().replace(/-/g, '').substring(0, 8)}`;

  await db.insert(deliverables).values({
    id: noteId,
    analysisId,
    type: 'review_note',
    name: `Note de revue — ${targetData.fileName}`,
    createdAt: now,
    createdBy: 'ai',
    currentVersion: 1,
    status: 'draft',
    contentJson: JSON.stringify(noteContent),
    sourceDocumentIds: JSON.stringify([target.legalObjectId]),
    referenceAssetIds: refAsset ? JSON.stringify([refAsset.id]) : '[]',
    sourceOperation: 'confrontation',
  });

  await db.update(analyses)
    .set({ lastActivityAt: now })
    .where(eq(analyses.id, analysisId));

  return [noteId];
}

// ─── Aggregation (clausier) ───────────────────────────────────────────────────

export async function runAggregation(analysisId: string): Promise<string[]> {
  const adRows = await db.select().from(analysisDocuments)
    .where(eq(analysisDocuments.analysisId, analysisId));

  const allData = await Promise.all(
    adRows.map((ad) => loadLegalObjectWithClauses(ad.legalObjectId)),
  );
  const valid = allData.filter(Boolean) as Awaited<ReturnType<typeof loadLegalObjectWithClauses>>[];

  if (!valid.length) throw new Error('No documents for aggregation');

  const allClausesSummary = valid.map((d) =>
    `### ${d!.fileName}\n${d!.clauses.map((c) => `[${c.type}] ${c.text.substring(0, 200)}`).join('\n')}`,
  ).join('\n\n');

  const prompt = `Constitue un clausier à partir des documents suivants.

${allClausesSummary || '(aucune clause extraite)'}

Génère un clausier JSON avec ce format EXACT :
{
  "type": "clausier",
  "title": "Clausier [type de contrats]",
  "scope": "description du périmètre couvert",
  "createdFromDocumentIds": ${JSON.stringify(adRows.map((r) => r.legalObjectId))},
  "entries": [
    {
      "clauseType": "TYPE",
      "clauseLabel": "Nom lisible de la clause",
      "bestVersion": "meilleur texte sélectionné parmi tous les documents",
      "sourceDocumentId": "id_du_document_source",
      "sourceDocumentName": "nom du document source",
      "alternativeVersions": [{ "text": "variante", "sourceDocumentId": "id" }],
      "notes": "commentaire et justification du choix"
    }
  ]
}`;

  const clausierContent = await llm.completeStructured<ClausierContent>(
    [
      { role: 'system', content: 'Tu es un expert en rédaction de clausiers juridiques. Retourne uniquement du JSON valide.' },
      { role: 'user', content: prompt },
    ],
    passthrough as unknown as import('zod').ZodSchema<ClausierContent>,
  );

  // Build flat view and extract structured fields per row during generation
  const entries = (clausierContent as { entries?: Array<{ clauseType: string; clauseLabel?: string; bestVersion: string; sourceDocumentId: string; sourceDocumentName?: string; alternativeVersions?: Array<{ text: string; sourceDocumentId: string }> }> }).entries ?? [];
  const flatRows: Array<{
    id: string; clauseLabel: string; clauseType: string;
    sourceDocumentId: string; sourceDocumentName: string;
    clauseText: string; isBestVersion: boolean;
    structuredFields?: Array<{ key: string; value: string }>;
  }> = [];

  for (const entry of entries) {
    const docName = valid.find(v => v?.legalObjectId === entry.sourceDocumentId)?.fileName ?? entry.sourceDocumentName ?? entry.sourceDocumentId;
    flatRows.push({
      id: `${entry.clauseType}_${entry.sourceDocumentId}`,
      clauseLabel: entry.clauseLabel || entry.clauseType,
      clauseType: entry.clauseType,
      sourceDocumentId: entry.sourceDocumentId,
      sourceDocumentName: entry.sourceDocumentName || docName,
      clauseText: entry.bestVersion,
      isBestVersion: true,
    });
    for (const alt of entry.alternativeVersions ?? []) {
      const altDocName = valid.find(v => v?.legalObjectId === alt.sourceDocumentId)?.fileName ?? alt.sourceDocumentId;
      flatRows.push({
        id: `${entry.clauseType}_${alt.sourceDocumentId}`,
        clauseLabel: entry.clauseLabel || entry.clauseType,
        clauseType: entry.clauseType,
        sourceDocumentId: alt.sourceDocumentId,
        sourceDocumentName: altDocName,
        clauseText: alt.text,
        isBestVersion: false,
      });
    }
  }

  await Promise.all(flatRows.map(async (row) => {
    try {
      row.structuredFields = await extractStructuredFields(row.clauseType, row.clauseText);
    } catch { row.structuredFields = []; }
  }));

  (clausierContent as Record<string, unknown>).flatView = {
    customColumns: [],
    rows: flatRows,
    cellsByDoc: {},
    selectedStructuredKeys: [],
  };

  const now = new Date().toISOString();
  const clausierId = `del_clausier_${uuidv4().replace(/-/g, '').substring(0, 8)}`;

  await db.insert(deliverables).values({
    id: clausierId,
    analysisId,
    type: 'clausier',
    name: `Clausier — ${valid.length} documents`,
    createdAt: now,
    createdBy: 'ai',
    currentVersion: 1,
    status: 'draft',
    contentJson: JSON.stringify(clausierContent),
    sourceDocumentIds: JSON.stringify(adRows.map((r) => r.legalObjectId)),
    referenceAssetIds: '[]',
    sourceOperation: 'aggregation',
  });

  await db.update(analyses)
    .set({ lastActivityAt: now })
    .where(eq(analyses.id, analysisId));

  return [clausierId];
}

// ─── Due Diligence (multi-documents) ─────────────────────────────────────────

interface DDSynthesisSection { theme: string; riskLevel: string; summary: string; recommendation: string; }
interface DDSynthesisContent { type: 'dd_synthesis'; title: string; executiveSummary: string; overallRiskLevel: string; keyFindings: string[]; documentCount: number; sections: DDSynthesisSection[]; }
interface DDTableRow { documentId: string; documentName: string; clauseType: string; clauseLabel: string; clauseText: string | null; riskLevel: string; finding: string; recommendation: string; }
interface DDTableContent { type: 'dd_table'; title: string; rows: DDTableRow[]; }

export async function runDD(analysisId: string): Promise<string[]> {
  const adRows = await db.select().from(analysisDocuments)
    .where(eq(analysisDocuments.analysisId, analysisId));

  const allData = await Promise.all(
    adRows.map((ad) => loadLegalObjectWithClauses(ad.legalObjectId)),
  );
  const valid = allData.filter(Boolean) as Awaited<ReturnType<typeof loadLegalObjectWithClauses>>[];

  if (!valid.length) throw new Error('No documents for due diligence');

  // Load the pinned reference asset from the analysis, fallback to first available
  const [ana] = await db.select({ referenceAssetId: analyses.referenceAssetId }).from(analyses).where(eq(analyses.id, analysisId));
  const refAssets = ana?.referenceAssetId
    ? await db.select().from(referenceAssets).where(eq(referenceAssets.id, ana.referenceAssetId))
    : await db.select().from(referenceAssets).limit(1);
  const refAsset = refAssets[0];
  const refContent = refAsset ? JSON.parse(refAsset.contentJson) : null;

  const allDocsSummary = valid.map((d) =>
    `### ${d!.fileName}\n${d!.clauses.map((c) => `[${c.type}] ${c.text.substring(0, 200)}`).join('\n')}`,
  ).join('\n\n');

  const synthPrompt = `Tu es un expert en due diligence juridique. Analyse ces documents et synthétise les risques.

DOCUMENTS :
${allDocsSummary || '(aucune clause extraite)'}

${refAsset ? 'RÉFÉRENTIEL :\n' + JSON.stringify(refContent).substring(0, 2000) : ''}

Génère une synthèse DD en JSON avec ce format EXACT :
{
  "type": "dd_synthesis",
  "title": "Due Diligence — [description]",
  "executiveSummary": "3-4 phrases pour un décideur non-juriste",
  "overallRiskLevel": "ok|low|medium|high|critical",
  "keyFindings": ["point clé 1", "point clé 2"],
  "documentCount": N,
  "sections": [
    {
      "theme": "thème identifié (ex: Confidentialité, Durée, Pénalités)",
      "riskLevel": "ok|low|medium|high|critical",
      "summary": "résumé du risque sur ce thème",
      "recommendation": "action recommandée"
    }
  ]
}`;

  const tablePrompt = `Tu es un expert en due diligence juridique. Analyse ces documents et génère un tableau détaillé des risques.

DOCUMENTS :
${allDocsSummary || '(aucune clause extraite)'}

Génère un tableau DD en JSON avec ce format EXACT :
{
  "type": "dd_table",
  "title": "Tableau de risques — [description]",
  "rows": [
    {
      "documentId": "id_du_document",
      "documentName": "nom du document",
      "clauseType": "TYPE",
      "clauseLabel": "nom lisible de la clause",
      "clauseText": "texte extrait ou null",
      "riskLevel": "ok|low|medium|high|critical",
      "finding": "constatation précise",
      "recommendation": "action recommandée"
    }
  ]
}
Génère une ligne par clause significative par document.`;

  const [synthContent, tableContent] = await Promise.all([
    llm.completeStructured<DDSynthesisContent>(
      [
        { role: 'system', content: 'Tu es un expert en due diligence juridique. Retourne uniquement du JSON valide.' },
        { role: 'user', content: synthPrompt },
      ],
      passthrough as unknown as import('zod').ZodSchema<DDSynthesisContent>,
    ),
    llm.completeStructured<DDTableContent>(
      [
        { role: 'system', content: 'Tu es un expert en due diligence juridique. Retourne uniquement du JSON valide.' },
        { role: 'user', content: tablePrompt },
      ],
      passthrough as unknown as import('zod').ZodSchema<DDTableContent>,
    ),
  ]);

  const now = new Date().toISOString();
  const synthId = `del_ddsynth_${uuidv4().replace(/-/g, '').substring(0, 8)}`;
  const tableId = `del_ddtable_${uuidv4().replace(/-/g, '').substring(0, 8)}`;

  await db.insert(deliverables).values([
    {
      id: synthId,
      analysisId,
      type: 'dd_synthesis',
      name: `Synthèse DD — ${valid.length} document(s)`,
      createdAt: now,
      createdBy: 'ai',
      currentVersion: 1,
      status: 'draft',
      contentJson: JSON.stringify(synthContent),
      sourceDocumentIds: JSON.stringify(adRows.map((r) => r.legalObjectId)),
      referenceAssetIds: refAsset ? JSON.stringify([refAsset.id]) : '[]',
      sourceOperation: 'dd',
    },
    {
      id: tableId,
      analysisId,
      type: 'dd_table',
      name: `Tableau de risques DD — ${valid.length} document(s)`,
      createdAt: now,
      createdBy: 'ai',
      currentVersion: 1,
      status: 'draft',
      contentJson: JSON.stringify(tableContent),
      sourceDocumentIds: JSON.stringify(adRows.map((r) => r.legalObjectId)),
      referenceAssetIds: refAsset ? JSON.stringify([refAsset.id]) : '[]',
      sourceOperation: 'dd',
    },
  ]);

  await db.update(analyses)
    .set({ lastActivityAt: now })
    .where(eq(analyses.id, analysisId));

  return [synthId, tableId];
}

// ─── M&A Mapping ─────────────────────────────────────────────────────────────

export async function runMaMapping(analysisId: string): Promise<string[]> {
  const adRows = await db.select().from(analysisDocuments)
    .where(eq(analysisDocuments.analysisId, analysisId));

  const allData = await Promise.all(adRows.map((ad) => loadLegalObjectWithClauses(ad.legalObjectId)));
  const valid = allData.filter(Boolean) as Awaited<ReturnType<typeof loadLegalObjectWithClauses>>[];
  if (!valid.length) throw new Error('No documents for M&A mapping');

  const allDocsSummary = valid.map((d) =>
    `### ${d!.fileName}\n${d!.clauses.map((c) => `[${c.type}] ${c.heading ?? ''}: ${c.text.substring(0, 300)}`).join('\n')}`,
  ).join('\n\n');

  const prompt = `Tu es un expert en due diligence M&A. Analyse ces contrats et identifie toutes les clauses à fort enjeu de transfert.
Cherche : changements de contrôle, résiliations automatiques, exclusivités, pénalités, non-concurrence, droits de préemption.

DOCUMENTS :
${allDocsSummary || '(aucune clause extraite)'}

Génère un tableau JSON avec ce format EXACT :
{
  "type": "ma_table",
  "title": "Cartographie des engagements hérités",
  "documentCount": ${valid.length},
  "rows": [
    {
      "documentName": "nom du fichier",
      "documentId": "id_legal_object",
      "clauseType": "CHANGEMENT_CONTROLE|RESILIATION_AUTO|EXCLUSIVITE|PENALITES|NON_CONCURRENCE|AUTRE",
      "summary": "résumé concis de l'engagement (1-2 phrases)",
      "riskLevel": "high|medium|low",
      "citation": { "page": null, "extract": "extrait pertinent ou null" }
    }
  ]
}
Génère une ligne par clause à enjeu identifiée. Si aucune clause à enjeu, retourne "rows": [].`;

  const content = await llm.completeStructured<MaTableContent>(
    [
      { role: 'system', content: 'Tu es un expert en due diligence M&A. Retourne uniquement du JSON valide.' },
      { role: 'user', content: prompt },
    ],
    passthrough as unknown as import('zod').ZodSchema<MaTableContent>,
  );

  const now = new Date().toISOString();
  const id = `del_ma_${uuidv4().replace(/-/g, '').substring(0, 8)}`;

  await db.insert(deliverables).values({
    id,
    analysisId,
    type: 'ma_table',
    name: `Cartographie M&A — ${valid.length} document(s)`,
    createdAt: now,
    createdBy: 'ai',
    currentVersion: 1,
    status: 'draft',
    contentJson: JSON.stringify(content),
    sourceDocumentIds: JSON.stringify(adRows.map((r) => r.legalObjectId)),
    referenceAssetIds: '[]',
    sourceOperation: 'ma_mapping',
  });

  await db.update(analyses).set({ lastActivityAt: now }).where(eq(analyses.id, analysisId));
  return [id];
}

// ─── Deadlines ────────────────────────────────────────────────────────────────

export async function runDeadlines(analysisId: string): Promise<string[]> {
  const adRows = await db.select().from(analysisDocuments)
    .where(eq(analysisDocuments.analysisId, analysisId));

  const allData = await Promise.all(adRows.map((ad) => loadLegalObjectWithClauses(ad.legalObjectId)));
  const valid = allData.filter(Boolean) as Awaited<ReturnType<typeof loadLegalObjectWithClauses>>[];
  if (!valid.length) throw new Error('No documents for deadline extraction');

  const allDocsSummary = valid.map((d) =>
    `### ${d!.fileName}\n${d!.clauses.map((c) => `[${c.type}] ${c.text.substring(0, 300)}`).join('\n')}`,
  ).join('\n\n');

  const today = new Date().toISOString().substring(0, 10);

  const prompt = `Tu es un expert juridique. Extrais toutes les dates et triggers temporels de ces contrats.
Cherche : renouvellements automatiques, préavis, fins de garantie, délais conditionnels, dates de livraison, périodes d'option.
Date du jour : ${today}. Si une échéance est dans les 90 jours, mettre isNearTerm: true.

DOCUMENTS :
${allDocsSummary || '(aucune clause extraite)'}

Génère un tableau JSON avec ce format EXACT :
{
  "type": "deadlines_table",
  "title": "Échéances contractuelles",
  "rows": [
    {
      "documentName": "nom du fichier",
      "documentId": "id_legal_object",
      "deadlineType": "RENOUVELLEMENT_AUTO|PREAVIS|FIN_GARANTIE|DELAI_CONDITIONNEL|DATE_LIVRAISON|AUTRE",
      "dateOrFormula": "2025-06-30 ou 'dans les 30 jours suivant la résiliation'",
      "trigger": "événement déclencheur",
      "consequence": "conséquence si non respecté ou inaction",
      "isNearTerm": false,
      "citation": { "page": null, "extract": "extrait ou null" }
    }
  ]
}
Trie les lignes par date croissante (dates fixes avant formules). Si aucune échéance trouvée, retourne "rows": [].`;

  const content = await llm.completeStructured<DeadlinesTableContent>(
    [
      { role: 'system', content: 'Tu es un expert juridique. Retourne uniquement du JSON valide.' },
      { role: 'user', content: prompt },
    ],
    passthrough as unknown as import('zod').ZodSchema<DeadlinesTableContent>,
  );

  const now = new Date().toISOString();
  const id = `del_dead_${uuidv4().replace(/-/g, '').substring(0, 8)}`;

  await db.insert(deliverables).values({
    id,
    analysisId,
    type: 'deadlines_table',
    name: `Échéances — ${valid.length} document(s)`,
    createdAt: now,
    createdBy: 'ai',
    currentVersion: 1,
    status: 'draft',
    contentJson: JSON.stringify(content),
    sourceDocumentIds: JSON.stringify(adRows.map((r) => r.legalObjectId)),
    referenceAssetIds: '[]',
    sourceOperation: 'deadlines',
  });

  await db.update(analyses).set({ lastActivityAt: now }).where(eq(analyses.id, analysisId));
  return [id];
}

// ─── Compliance ───────────────────────────────────────────────────────────────

export async function runCompliance(analysisId: string): Promise<string[]> {
  const adRows = await db.select().from(analysisDocuments)
    .where(eq(analysisDocuments.analysisId, analysisId));

  const allData = await Promise.all(adRows.map((ad) => loadLegalObjectWithClauses(ad.legalObjectId)));
  const valid = allData.filter(Boolean) as Awaited<ReturnType<typeof loadLegalObjectWithClauses>>[];
  if (!valid.length) throw new Error('No documents for compliance audit');

  const [ana] = await db.select({ referenceAssetId: analyses.referenceAssetId }).from(analyses).where(eq(analyses.id, analysisId));
  const refAssets = ana?.referenceAssetId
    ? await db.select().from(referenceAssets).where(eq(referenceAssets.id, ana.referenceAssetId))
    : await db.select().from(referenceAssets).limit(1);
  const refAsset = refAssets[0];
  const refContent = refAsset ? JSON.parse(refAsset.contentJson) : null;
  const frameworkName = refAsset?.name ?? 'Référentiel réglementaire';

  const allDocsSummary = valid.map((d) =>
    `### ${d!.fileName}\n${d!.clauses.map((c) => `[${c.type}] ${c.text.substring(0, 300)}`).join('\n')}`,
  ).join('\n\n');

  const prompt = `Tu es un expert en conformité réglementaire. Audite ces contrats clause par clause.

CONTRATS :
${allDocsSummary || '(aucune clause extraite)'}

${refContent ? `RÉFÉRENTIEL RÉGLEMENTAIRE (${frameworkName}) :\n${JSON.stringify(refContent).substring(0, 2000)}` : `RÉFÉRENTIEL : Applique les bonnes pratiques générales et le droit français (conformité RGPD si pertinent, etc.).`}

Génère un rapport JSON avec ce format EXACT :
{
  "type": "compliance_note",
  "title": "Audit de conformité réglementaire",
  "framework": "${frameworkName}",
  "synthesis": "note de synthèse globale (3-5 phrases)",
  "rows": [
    {
      "documentName": "nom du fichier",
      "clauseType": "TYPE_CLAUSE",
      "clauseLabel": "Nom lisible",
      "requirement": "exigence réglementaire applicable",
      "status": "conforme|attention|non_conforme",
      "recommendedAction": "action recommandée ou null si conforme"
    }
  ]
}
Génère une ligne par clause auditée. Couvre toutes les clauses significatives.`;

  const content = await llm.completeStructured<ComplianceNoteContent>(
    [
      { role: 'system', content: 'Tu es un expert en conformité réglementaire. Retourne uniquement du JSON valide.' },
      { role: 'user', content: prompt },
    ],
    passthrough as unknown as import('zod').ZodSchema<ComplianceNoteContent>,
  );

  const now = new Date().toISOString();
  const id = `del_comp_${uuidv4().replace(/-/g, '').substring(0, 8)}`;

  await db.insert(deliverables).values({
    id,
    analysisId,
    type: 'compliance_note',
    name: `Audit conformité — ${valid.length} document(s)`,
    createdAt: now,
    createdBy: 'ai',
    currentVersion: 1,
    status: 'draft',
    contentJson: JSON.stringify(content),
    sourceDocumentIds: JSON.stringify(adRows.map((r) => r.legalObjectId)),
    referenceAssetIds: refAsset ? JSON.stringify([refAsset.id]) : '[]',
    sourceOperation: 'compliance',
  });

  await db.update(analyses).set({ lastActivityAt: now }).where(eq(analyses.id, analysisId));
  return [id];
}

// ─── Inconsistencies ─────────────────────────────────────────────────────────

export async function runInconsistencies(analysisId: string): Promise<string[]> {
  const adRows = await db.select().from(analysisDocuments)
    .where(eq(analysisDocuments.analysisId, analysisId));

  const allData = await Promise.all(adRows.map((ad) => loadLegalObjectWithClauses(ad.legalObjectId)));
  const valid = allData.filter(Boolean) as Awaited<ReturnType<typeof loadLegalObjectWithClauses>>[];
  if (valid.length < 2) throw new Error('Inconsistencies analysis requires at least 2 documents');

  const allDocsSummary = valid.map((d) =>
    `### ${d!.fileName} (id: ${d!.lo.id})\n${d!.clauses.map((c) => `[${c.type}] ${c.heading ?? ''}: ${c.text.substring(0, 250)}`).join('\n')}`,
  ).join('\n\n');

  const prompt = `Tu es un expert juridique. Compare ces ${valid.length} contrats et repère les incohérences entre clauses du même type.

DOCUMENTS :
${allDocsSummary || '(aucune clause extraite)'}

Génère un rapport JSON avec ce format EXACT :
{
  "type": "inconsistencies_report",
  "title": "Rapport d'incohérences inter-contrats",
  "documentCount": ${valid.length},
  "groups": [
    {
      "clauseType": "TYPE_CLAUSE",
      "clauseLabel": "Nom lisible de la clause",
      "rows": [
        {
          "documentName": "nom du fichier",
          "documentId": "id_legal_object",
          "clauseText": "texte de la clause dans ce contrat ou null si absente",
          "level": "aligned|variant|divergent"
        }
      ]
    }
  ]
}
Règles : "aligned" = formulations proches, "variant" = différences mineures, "divergent" = contradiction ou écart substantiel.
Couvre uniquement les types de clause présents dans au moins 2 documents. Trie les groupes par niveau de divergence (divergent en premier).`;

  const content = await llm.completeStructured<InconsistenciesReportContent>(
    [
      { role: 'system', content: 'Tu es un expert juridique comparatiste. Retourne uniquement du JSON valide.' },
      { role: 'user', content: prompt },
    ],
    passthrough as unknown as import('zod').ZodSchema<InconsistenciesReportContent>,
  );

  const now = new Date().toISOString();
  const id = `del_inco_${uuidv4().replace(/-/g, '').substring(0, 8)}`;

  await db.insert(deliverables).values({
    id,
    analysisId,
    type: 'inconsistencies_report',
    name: `Incohérences — ${valid.length} contrats`,
    createdAt: now,
    createdBy: 'ai',
    currentVersion: 1,
    status: 'draft',
    contentJson: JSON.stringify(content),
    sourceDocumentIds: JSON.stringify(adRows.map((r) => r.legalObjectId)),
    referenceAssetIds: '[]',
    sourceOperation: 'inconsistencies',
  });

  await db.update(analyses).set({ lastActivityAt: now }).where(eq(analyses.id, analysisId));
  return [id];
}

// ─── Main message handler ──────────────────────────────────────────────────────

export async function handleUserMessage(
  analysisId: string,
  userMessage: string,
): Promise<{ assistantMessage: string; deliverableIds: string[] }> {
  const context = await getAnalysisContext(analysisId);
  console.log(`[${analysisId}] Context: ${context}`);

  const intent = await parseIntent(userMessage, context);
  console.log(`[${analysisId}] Intent: operation=${intent.operation}, clarificationNeeded=${intent.clarificationNeeded}`);

  let assistantMessage: string;
  let deliverableIds: string[] = [];

  if (intent.clarificationNeeded) {
    assistantMessage = intent.clarificationNeeded;
  } else {
    const llmResponse = await llm.complete([
      { role: 'system', content: `Tu es un assistant juridique expert. Contexte de l'analyse :\n${context}` },
      { role: 'user', content: userMessage },
    ]);
    assistantMessage = llmResponse.content;

    try {
      if (intent.operation === 'alignment') {
        console.log(`[${analysisId}] Running alignment...`);
        deliverableIds = await runAlignment(analysisId);
        assistantMessage = assistantMessage.trim() + `\n\nJ'ai généré une note comparative et un redline. Vous pouvez les consulter dans le panneau de droite.`;
      } else if (intent.operation === 'confrontation') {
        console.log(`[${analysisId}] Running confrontation...`);
        deliverableIds = await runConfrontation(analysisId);
        assistantMessage = assistantMessage.trim() + `\n\nJ'ai généré la note de revue. Vous pouvez la consulter dans le panneau de droite.`;
      } else if (intent.operation === 'aggregation') {
        console.log(`[${analysisId}] Running aggregation...`);
        deliverableIds = await runAggregation(analysisId);
        assistantMessage = assistantMessage.trim() + `\n\nJ'ai constitué le clausier. Vous pouvez le consulter dans le panneau de droite.`;
      } else if (intent.operation === 'ma_mapping') {
        console.log(`[${analysisId}] Running M&A mapping...`);
        deliverableIds = await runMaMapping(analysisId);
        assistantMessage = assistantMessage.trim() + `\n\nJ'ai cartographié les engagements à fort enjeu de transfert. Vous pouvez consulter le tableau dans le panneau de droite.`;
      } else if (intent.operation === 'deadlines') {
        console.log(`[${analysisId}] Running deadline extraction...`);
        deliverableIds = await runDeadlines(analysisId);
        assistantMessage = assistantMessage.trim() + `\n\nJ'ai extrait toutes les échéances contractuelles. Les délais proches sont mis en évidence dans le panneau de droite.`;
      } else if (intent.operation === 'compliance') {
        console.log(`[${analysisId}] Running compliance audit...`);
        deliverableIds = await runCompliance(analysisId);
        assistantMessage = assistantMessage.trim() + `\n\nL'audit de conformité réglementaire est disponible dans le panneau de droite.`;
      } else if (intent.operation === 'inconsistencies') {
        console.log(`[${analysisId}] Running inconsistency detection...`);
        deliverableIds = await runInconsistencies(analysisId);
        assistantMessage = assistantMessage.trim() + `\n\nJ'ai détecté les incohérences inter-contrats. Le rapport est disponible dans le panneau de droite.`;
      } else {
        console.log(`[${analysisId}] Operation 'unclear' — no deliverable generated`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[${analysisId}] Deliverable generation error (${intent.operation}): ${errMsg}`);
      if (err instanceof Error && err.stack) console.error(err.stack);
      assistantMessage = assistantMessage.trim() + `\n\nLa génération a rencontré un problème. Souhaitez-vous réessayer ?`;
    }
  }

  console.log(`[${analysisId}] Done. deliverableIds=${JSON.stringify(deliverableIds)}`);
  return { assistantMessage, deliverableIds };
}
