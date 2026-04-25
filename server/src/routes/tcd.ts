import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { db } from '../db/index.js';
import { deliverables, legalObjects, clauses, documents } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { llm } from '../llm/index.js';

export const tcdRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClausierCustomColumn {
  id: string;
  name: string;
  dataType: 'text' | 'amount' | 'date' | 'boolean' | 'percentage';
  extractionInstruction?: string;
  position: number;
}

interface ClausierCustomCell {
  value: string | null;
  confidence: number;
  citation?: { fullText: string; articleReference: string; pageNumber: number };
  notFound: boolean;
}

interface ClausierStructuredField {
  key: string;
  value: string;
}

interface ClausierFlatRow {
  id: string;
  clauseLabel: string;
  clauseType: string;
  sourceDocumentId: string;
  sourceDocumentName: string;
  clauseText: string;
  isBestVersion: boolean;
  pageNumber?: number;
  structuredFields?: ClausierStructuredField[];
  structuredFieldsStatus?: 'pending' | 'extracting' | 'done' | 'error';
}

interface ClausierFlatView {
  customColumns: ClausierCustomColumn[];
  rows: ClausierFlatRow[];
  cellsByDoc: Record<string, Record<string, ClausierCustomCell>>;
  selectedStructuredKeys: string[];
}

interface ClausierEntry {
  clauseType: string;
  clauseLabel: string;
  bestVersion: string;
  sourceDocumentId: string;
  sourceDocumentName: string;
  alternativeVersions?: Array<{ text: string; sourceDocumentId: string }>;
}

interface StoredContent {
  type: string;
  createdFromDocumentIds?: string[];
  flatView?: ClausierFlatView;
  entries?: ClausierEntry[];
  [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getDocName(loId: string): Promise<string> {
  const [lo] = await db.select({ documentId: legalObjects.documentId })
    .from(legalObjects).where(eq(legalObjects.id, loId));
  if (!lo) return loId;
  const [doc] = await db.select({ fileName: documents.fileName })
    .from(documents).where(eq(documents.id, lo.documentId));
  return doc?.fileName ?? loId;
}

async function loadDocNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.all(ids.map(async id => { map.set(id, await getDocName(id)); }));
  return map;
}

function buildFlatViewFromEntries(
  entries: ClausierEntry[],
  docNames: Map<string, string>,
): ClausierFlatView {
  const rows: ClausierFlatRow[] = [];

  for (const entry of entries) {
    rows.push({
      id: `${entry.clauseType}_${entry.sourceDocumentId}`,
      clauseLabel: entry.clauseLabel || entry.clauseType,
      clauseType: entry.clauseType,
      sourceDocumentId: entry.sourceDocumentId,
      sourceDocumentName: entry.sourceDocumentName || docNames.get(entry.sourceDocumentId) || entry.sourceDocumentId,
      clauseText: entry.bestVersion,
      isBestVersion: true,
    });

    for (const alt of entry.alternativeVersions ?? []) {
      rows.push({
        id: `${entry.clauseType}_${alt.sourceDocumentId}`,
        clauseLabel: entry.clauseLabel || entry.clauseType,
        clauseType: entry.clauseType,
        sourceDocumentId: alt.sourceDocumentId,
        sourceDocumentName: docNames.get(alt.sourceDocumentId) || alt.sourceDocumentId,
        clauseText: alt.text,
        isBestVersion: false,
      });
    }
  }

  return { customColumns: [], rows, cellsByDoc: {}, selectedStructuredKeys: [] };
}

// ─── extractColumnForDoc ──────────────────────────────────────────────────────

const passthrough = { parse: (v: unknown) => v } as unknown as import('zod').ZodSchema<unknown>;

export async function extractColumnForDoc(
  docData: { fileName: string; clauses: Array<{ type: string; text: string }> },
  column: { name: string; dataType: string; extractionInstruction?: string },
): Promise<{ value: string | null; confidence: number; citation?: { fullText: string; articleReference: string; pageNumber: number }; notFound: boolean }> {
  const clausesSummary = docData.clauses
    .map((c) => `[${c.type}] ${c.text.substring(0, 300)}`)
    .join('\n');

  const prompt = `Extrait la valeur pour la colonne "${column.name}" depuis ce document juridique.
Type de donnée attendu: ${column.dataType}
${column.extractionInstruction ? `Instruction: ${column.extractionInstruction}` : ''}

Contenu du document (clauses):
${clausesSummary || '(aucune clause extraite)'}

Réponds en JSON (et uniquement JSON, sans texte autour) :
{
  "value": "valeur extraite",
  "confidence": 0.95,
  "citation": { "fullText": "texte de référence dans le document", "articleReference": "Art. X", "pageNumber": 1 },
  "notFound": false
}

Si l'information n'est pas dans le document :
{ "value": null, "confidence": 0, "notFound": true }`;

  try {
    const result = await llm.completeStructured<{
      value: string | null;
      confidence: number;
      citation?: { fullText: string; articleReference: string; pageNumber: number };
      notFound: boolean;
    }>(
      [
        { role: 'system', content: 'Tu es un expert juridique en extraction d\'informations. Retourne uniquement du JSON valide.' },
        { role: 'user', content: prompt },
      ],
      passthrough as unknown as import('zod').ZodSchema<{ value: string | null; confidence: number; citation?: { fullText: string; articleReference: string; pageNumber: number }; notFound: boolean }>,
    );
    return {
      value: result.value ?? null,
      confidence: typeof result.confidence === 'number' ? result.confidence : 0,
      citation: result.citation,
      notFound: result.notFound ?? false,
    };
  } catch {
    return { value: null, confidence: 0, notFound: true };
  }
}

// ─── extractStructuredFields ─────────────────────────────────────────────────

export async function extractStructuredFields(
  clauseType: string,
  clauseText: string,
): Promise<ClausierStructuredField[]> {
  if (!clauseText?.trim()) return [];

  const prompt = `Tu es un expert juridique. Analyse cette clause de type "${clauseType}".

Texte :
"${clauseText.substring(0, 2000)}"

Identifie et extrait tous les éléments structurés clés : montants, durées, dates, pourcentages, seuils numériques, conditions chiffrées, délais, parties nommées, obligations quantifiées, etc.

Réponds UNIQUEMENT en JSON :
{ "fields": [ { "key": "Durée", "value": "3 ans" }, { "key": "Préavis", "value": "3 mois" } ] }

Si aucun élément structuré n'est présent : { "fields": [] }`;

  try {
    const result = await llm.completeStructured<{ fields: ClausierStructuredField[] }>(
      [
        { role: 'system', content: 'Tu es un expert juridique. Retourne uniquement du JSON valide.' },
        { role: 'user', content: prompt },
      ],
      passthrough as unknown as import('zod').ZodSchema<{ fields: ClausierStructuredField[] }>,
    );
    return Array.isArray(result?.fields) ? result.fields : [];
  } catch {
    return [];
  }
}

// ─── GET /api/deliverables/:id/tcd ───────────────────────────────────────────

tcdRouter.get('/deliverables/:id/tcd', async (req, res) => {
  const [del] = await db.select().from(deliverables).where(eq(deliverables.id, req.params.id));
  if (!del) return res.status(404).json({ error: 'Livrable introuvable' });
  if (del.type !== 'clausier') return res.status(400).json({ error: 'Ce livrable n\'est pas un clausier' });

  const content = JSON.parse(del.contentJson) as StoredContent;

  if (content.flatView) {
    if (!content.flatView.selectedStructuredKeys) content.flatView.selectedStructuredKeys = [];
    return res.json(content.flatView);
  }

  const entries: ClausierEntry[] = content.entries ?? [];
  const allDocIds = new Set<string>();
  for (const e of entries) {
    allDocIds.add(e.sourceDocumentId);
    for (const alt of e.alternativeVersions ?? []) allDocIds.add(alt.sourceDocumentId);
  }
  const docNames = await loadDocNames([...allDocIds]);
  const flatView = buildFlatViewFromEntries(entries, docNames);

  content.flatView = flatView;
  await db.update(deliverables)
    .set({ contentJson: JSON.stringify(content) })
    .where(eq(deliverables.id, del.id));

  return res.json(flatView);
});

// ─── POST /api/deliverables/:id/tcd/columns ──────────────────────────────────

tcdRouter.post('/deliverables/:id/tcd/columns', async (req, res) => {
  const { name, dataType, extractionInstruction, fromStructuredField, key } = req.body as {
    name?: string;
    dataType?: 'text' | 'amount' | 'date' | 'boolean' | 'percentage';
    extractionInstruction?: string;
    fromStructuredField?: boolean;
    key?: string;
  };

  const [del] = await db.select().from(deliverables).where(eq(deliverables.id, req.params.id));
  if (!del) return res.status(404).json({ error: 'Livrable introuvable' });
  if (del.type !== 'clausier') return res.status(400).json({ error: 'Ce livrable n\'est pas un clausier' });

  const content = JSON.parse(del.contentJson) as StoredContent;
  let flatView = content.flatView;
  if (!flatView) {
    const entries: ClausierEntry[] = content.entries ?? [];
    const allDocIds = new Set<string>();
    for (const e of entries) {
      allDocIds.add(e.sourceDocumentId);
      for (const alt of e.alternativeVersions ?? []) allDocIds.add(alt.sourceDocumentId);
    }
    const docNames = await loadDocNames([...allDocIds]);
    flatView = buildFlatViewFromEntries(entries, docNames);
  }
  if (!flatView.selectedStructuredKeys) flatView.selectedStructuredKeys = [];

  // ── Mode champ structuré pré-extrait : juste ajouter la clé à selectedStructuredKeys ──
  if (fromStructuredField && key) {
    if (!flatView.selectedStructuredKeys.includes(key)) flatView.selectedStructuredKeys.push(key);
    content.flatView = flatView;
    await db.update(deliverables).set({ contentJson: JSON.stringify(content) }).where(eq(deliverables.id, del.id));
    return res.json(flatView);
  }

  if (!name?.trim()) return res.status(400).json({ error: 'Le nom de la colonne est requis' });
  if (!dataType) return res.status(400).json({ error: 'Le type de donnée est requis' });

  const colId = `col_${uuidv4()}`;
  const newCol: ClausierCustomColumn = {
    id: colId,
    name: name.trim(),
    dataType,
    extractionInstruction: extractionInstruction?.trim() || undefined,
    position: flatView.customColumns.length,
  };
  flatView.customColumns.push(newCol);

  // Extract once per unique document
  const uniqueDocIds = [...new Set(flatView.rows.map(r => r.sourceDocumentId))];
  await Promise.all(uniqueDocIds.map(async (docId) => {
    const docRow = flatView!.rows.find(r => r.sourceDocumentId === docId);
    const clauseRows = await db.select({ type: clauses.type, text: clauses.text })
      .from(clauses).where(eq(clauses.legalObjectId, docId));

    const extraction = await extractColumnForDoc(
      { fileName: docRow?.sourceDocumentName ?? docId, clauses: clauseRows },
      { name, dataType, extractionInstruction },
    );

    if (!flatView!.cellsByDoc[docId]) flatView!.cellsByDoc[docId] = {};
    flatView!.cellsByDoc[docId][colId] = {
      value: extraction.value,
      confidence: extraction.confidence,
      citation: extraction.citation,
      notFound: extraction.notFound,
    };
  }));

  content.flatView = flatView;
  await db.update(deliverables)
    .set({ contentJson: JSON.stringify(content) })
    .where(eq(deliverables.id, del.id));

  return res.json(flatView);
});

// ─── DELETE /api/deliverables/:id/tcd/columns/:colId ─────────────────────────

tcdRouter.delete('/deliverables/:id/tcd/columns/:colId', async (req, res) => {
  const { colId } = req.params;

  const [del] = await db.select().from(deliverables).where(eq(deliverables.id, req.params.id));
  if (!del) return res.status(404).json({ error: 'Livrable introuvable' });
  if (del.type !== 'clausier') return res.status(400).json({ error: 'Ce livrable n\'est pas un clausier' });

  const content = JSON.parse(del.contentJson) as StoredContent;
  const flatView = content.flatView;
  if (!flatView) return res.status(404).json({ error: 'Vue plate non générée' });

  const colIndex = flatView.customColumns.findIndex(c => c.id === colId);
  if (colIndex === -1) return res.status(404).json({ error: 'Colonne introuvable' });

  flatView.customColumns.splice(colIndex, 1);
  flatView.customColumns.forEach((c, i) => { c.position = i; });
  for (const docCells of Object.values(flatView.cellsByDoc)) {
    delete docCells[colId];
  }

  content.flatView = flatView;
  await db.update(deliverables)
    .set({ contentJson: JSON.stringify(content) })
    .where(eq(deliverables.id, del.id));

  return res.json(flatView);
});

// ─── DELETE /api/deliverables/:id/tcd/structured-keys/:key ───────────────────

tcdRouter.delete('/deliverables/:id/tcd/structured-keys/:key', async (req, res) => {
  const key = decodeURIComponent(req.params.key);

  const [del] = await db.select().from(deliverables).where(eq(deliverables.id, req.params.id));
  if (!del) return res.status(404).json({ error: 'Livrable introuvable' });
  if (del.type !== 'clausier') return res.status(400).json({ error: 'Ce livrable n\'est pas un clausier' });

  const content = JSON.parse(del.contentJson) as StoredContent;
  const flatView = content.flatView;
  if (!flatView) return res.status(404).json({ error: 'Vue plate non générée' });

  if (!flatView.selectedStructuredKeys) flatView.selectedStructuredKeys = [];
  flatView.selectedStructuredKeys = flatView.selectedStructuredKeys.filter(k => k !== key);

  content.flatView = flatView;
  await db.update(deliverables).set({ contentJson: JSON.stringify(content) }).where(eq(deliverables.id, del.id));

  return res.json(flatView);
});

// ─── GET /api/deliverables/:id/tcd/export/xlsx ───────────────────────────────

tcdRouter.get('/deliverables/:id/tcd/export/xlsx', async (req, res) => {
  const [del] = await db.select().from(deliverables).where(eq(deliverables.id, req.params.id));
  if (!del) return res.status(404).json({ error: 'Livrable introuvable' });
  if (del.type !== 'clausier') return res.status(400).json({ error: 'Ce livrable n\'est pas un clausier' });

  const content = JSON.parse(del.contentJson) as StoredContent;
  const flatView = content.flatView;
  if (!flatView) return res.status(404).json({ error: 'Vue plate non générée' });

  const selectedStructuredKeys = flatView.selectedStructuredKeys ?? [];
  const fixedHeaders = ['Nom de la clause', 'Document source', 'Type', 'Texte de la clause'];
  const structuredHeaders = selectedStructuredKeys;
  const customHeaders = flatView.customColumns.map(c => c.name);
  const headers = [...fixedHeaders, ...structuredHeaders, ...customHeaders];

  const dataRows = flatView.rows.map(row => {
    const rowData: string[] = [row.clauseLabel, row.sourceDocumentName, row.clauseType, row.clauseText];
    for (const k of selectedStructuredKeys) {
      rowData.push(row.structuredFields?.find(f => f.key === k)?.value ?? '');
    }
    for (const col of flatView.customColumns) {
      const cell = flatView.cellsByDoc[row.sourceDocumentId]?.[col.id];
      rowData.push(cell?.value ?? '');
    }
    return rowData;
  });

  const wsData = [headers, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = { font: { bold: true } };
  }

  ws['!autofilter'] = { ref: ws['!ref'] ?? 'A1' };
  ws['!cols'] = [
    { wch: 30 }, { wch: 30 }, { wch: 20 }, { wch: 60 },
    ...structuredHeaders.map(() => ({ wch: 20 })),
    ...customHeaders.map(() => ({ wch: 25 })),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clausier');

  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const filename = `clausier_${dateStr}.xlsx`;
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});
