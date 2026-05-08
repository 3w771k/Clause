import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/index.js';
import { tabularReviews, tabularRows, tabularCells, documents } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface TabularColumn {
  id: string;
  label: string;
  question: string;
  expectedType: string;
}

export const ALLOWED_TYPES = new Set(['text', 'number', 'date', 'enum', 'boolean']);

export function parseColumns(raw: string): TabularColumn[] {
  try { return JSON.parse(raw); } catch { return []; }
}

export function cellId() { return `tc_${uuidv4().replace(/-/g, '').substring(0, 12)}`; }

export function sanitizeText(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  return s.replace(/<[^>]*>/g, '').slice(0, max).trim();
}

export async function extractCellValue(
  docText: string,
  column: TabularColumn,
): Promise<{ value: string | null; rawValue: string | null; confidence: string; citationJson: string }> {
  const prompt = `You are a legal analyst. Answer the following question based solely on the document text below.

The question may be bilingual (French / English separated by " / "). Detect the language of the DOCUMENT and answer in that language. The "rawValue" must be a verbatim excerpt from the document, in the document's original language.

Question: ${column.question}

Document:
<document>
${docText.substring(0, 10000)}
</document>

Return a JSON object with:
- "value": concise answer (1-3 sentences max), in the document's language, or null if absent
- "rawValue": verbatim excerpt from the document that supports your answer (original language), or null
- "confidence": "high" | "medium" | "low" | "absent"
- "page": page number if identifiable, or null

Return only valid JSON.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content.find(b => b.type === 'text')?.text ?? '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no json');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      value: parsed.value ?? null,
      rawValue: parsed.rawValue ?? null,
      confidence: parsed.confidence ?? 'absent',
      citationJson: JSON.stringify({ page: parsed.page ?? null, excerpt: parsed.rawValue ?? null }),
    };
  } catch {
    return { value: null, rawValue: null, confidence: 'absent', citationJson: '{}' };
  }
}

export async function loadFullReview(analysisId: string, trId: string) {
  const [review] = await db.select().from(tabularReviews)
    .where(and(eq(tabularReviews.id, trId), eq(tabularReviews.analysisId, analysisId)));
  if (!review) return null;
  const rowsRaw = await db.select({ row: tabularRows, fileName: documents.fileName })
    .from(tabularRows)
    .leftJoin(documents, eq(documents.id, tabularRows.documentId))
    .where(eq(tabularRows.tabularReviewId, trId));
  const cells = await db.select().from(tabularCells).where(eq(tabularCells.tabularReviewId, trId));
  return {
    ...review,
    columns: parseColumns(review.columnsJson),
    rows: rowsRaw.map(({ row: r, fileName }) => ({
      ...r,
      fileName: fileName ?? r.documentId,
      cells: cells
        .filter(c => c.rowId === r.id)
        .map(c => ({ ...c, citation: c.citationJson ? JSON.parse(c.citationJson) : null })),
    })),
  };
}

export async function rerunColumnCells(trId: string, col: TabularColumn) {
  const rows = await db.select({
    row: tabularRows,
    extractedText: documents.extractedText,
  })
    .from(tabularRows)
    .innerJoin(documents, eq(documents.id, tabularRows.documentId))
    .where(eq(tabularRows.tabularReviewId, trId));

  const now = new Date().toISOString();
  for (const { row, extractedText } of rows) {
    const extracted = await extractCellValue(extractedText || '', col);
    const [existing] = await db.select().from(tabularCells)
      .where(and(
        eq(tabularCells.tabularReviewId, trId),
        eq(tabularCells.rowId, row.id),
        eq(tabularCells.columnId, col.id),
      ));
    if (existing) {
      await db.update(tabularCells).set({
        value: extracted.value,
        rawValue: extracted.rawValue,
        confidence: extracted.confidence,
        citationJson: extracted.citationJson,
        status: 'fresh',
        lastRunAt: now,
        isUserEdited: false,
      }).where(eq(tabularCells.id, existing.id));
    } else {
      await db.insert(tabularCells).values({
        id: cellId(),
        tabularReviewId: trId,
        rowId: row.id,
        columnId: col.id,
        columnLabel: col.label,
        value: extracted.value,
        rawValue: extracted.rawValue,
        confidence: extracted.confidence,
        citationJson: extracted.citationJson,
        status: 'fresh',
        lastRunAt: now,
      });
    }
  }
}
