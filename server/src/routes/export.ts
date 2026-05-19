import { Router } from 'express';
import { Document, Packer, Paragraph, TextRun, InsertedTextRun, DeletedTextRun, HeadingLevel } from 'docx';
import { db } from '../db/index.js';
import { deliverables } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const exportRouter = Router();

const AUTHOR = 'Clause AI';

interface RedlineContent {
  type: 'redline';
  targetDocumentId: string;
  baseHtml: string;
  changes: Array<{
    id: string;
    type: 'replacement' | 'insertion' | 'deletion';
    originalText: string;
    newText: string;
    clauseContext: string;
    rationale: string;
    status: 'pending' | 'accepted' | 'rejected';
  }>;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripInlineTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

// Parse a paragraph's inner HTML into docx runs, handling <del> and <ins> inline
function parseParaToRuns(
  html: string,
  dateIso: string,
  revIdRef: { n: number },
): (TextRun | DeletedTextRun | InsertedTextRun)[] {
  const runs: (TextRun | DeletedTextRun | InsertedTextRun)[] = [];
  const tokenRe = /<(del|ins)[^>]*>([\s\S]*?)<\/\1>|<br\s*\/?>|([^<]+)/gi;
  let m: RegExpExecArray | null;

  while ((m = tokenRe.exec(html)) !== null) {
    const tag = m[1]?.toLowerCase();
    if (tag === 'del') {
      const text = decodeHtmlEntities(stripInlineTags(m[2] ?? ''));
      if (text.trim()) {
        runs.push(new DeletedTextRun({ id: ++revIdRef.n, text, author: AUTHOR, date: dateIso, size: 22 }));
      }
    } else if (tag === 'ins') {
      const text = decodeHtmlEntities(stripInlineTags(m[2] ?? ''));
      if (text.trim()) {
        runs.push(new InsertedTextRun({ id: ++revIdRef.n, text, author: AUTHOR, date: dateIso, size: 22 }));
      }
    } else if (m[0].toLowerCase().startsWith('<br')) {
      // line break — start new run with break
      runs.push(new TextRun({ text: '', break: 1 }));
    } else if (m[3]) {
      const text = decodeHtmlEntities(m[3]);
      if (text.trim()) runs.push(new TextRun({ text, size: 22 }));
    }
  }
  return runs;
}

// Parse baseHtml (produced by buildCkEditorHtml / buildComparisonRedlineHtml) into docx Paragraph[]
function parseHtmlToParagraphs(baseHtml: string, dateIso: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const revIdRef = { n: 0 };

  // Strip section wrappers — their children (h3, p) are handled inline
  const flatHtml = baseHtml.replace(/<\/?section[^>]*>/gi, '');

  // Match block-level elements: <h3>, <p>, <hr>
  const blockRe = /<h3[^>]*>([\s\S]*?)<\/h3>|<p[^>]*>([\s\S]*?)<\/p>|<hr[^>]*>/gi;
  let m: RegExpExecArray | null;

  while ((m = blockRe.exec(flatHtml)) !== null) {
    const raw = m[0].toLowerCase();

    if (raw.startsWith('<hr')) {
      // clause separator → visual spacer
      paragraphs.push(new Paragraph({ children: [], spacing: { before: 160, after: 160 } }));

    } else if (m[1] !== undefined) {
      // <h3> clause heading
      const text = decodeHtmlEntities(stripInlineTags(m[1]));
      if (text.trim()) {
        paragraphs.push(new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: text.trim(), bold: true, size: 22 })],
          spacing: { before: 280, after: 80 },
        }));
      }

    } else if (m[2] !== undefined) {
      // <p> — may contain inline <del>/<ins>
      const runs = parseParaToRuns(m[2], dateIso, revIdRef);
      if (runs.length > 0) {
        paragraphs.push(new Paragraph({ children: runs, spacing: { after: 120 } }));
      }
    }
  }

  return paragraphs;
}

// Fallback: build from changes[] when baseHtml has no inline del/ins (legacy)
function buildFallbackParagraphs(
  basePlainText: string,
  changes: RedlineContent['changes'],
  dateIso: string,
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const revIdRef = { n: 0 };

  if (basePlainText) {
    for (const sentence of basePlainText.split(/(?<=[.!?])\s+/)) {
      if (sentence.trim()) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: sentence.trim(), size: 22 })], spacing: { after: 120 } }));
      }
    }
  }

  const relevant = changes.filter(c => c.status !== 'rejected');
  if (relevant.length === 0) return paragraphs;

  paragraphs.push(new Paragraph({ children: [new TextRun({ text: '', break: 1 })] }));
  paragraphs.push(new Paragraph({
    children: [new TextRun({ text: 'Modifications suggérées', bold: true, size: 26 })],
    spacing: { before: 400, after: 200 },
  }));

  for (const change of relevant) {
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({ text: `[${change.clauseContext}] `, bold: true, size: 20 }),
        new TextRun({ text: change.rationale, italics: true, size: 20, color: '666666' }),
      ],
      spacing: { before: 200, after: 80 },
    }));

    const children: (TextRun | DeletedTextRun | InsertedTextRun)[] = [];
    const revId = ++revIdRef.n;

    if (change.type === 'replacement') {
      if (change.originalText) children.push(new DeletedTextRun({ id: revId, text: change.originalText, author: AUTHOR, date: dateIso, size: 22 }));
      if (change.newText) children.push(new InsertedTextRun({ id: revId, text: change.newText, author: AUTHOR, date: dateIso, size: 22 }));
    } else if (change.type === 'insertion') {
      if (change.newText) children.push(new InsertedTextRun({ id: revId, text: change.newText, author: AUTHOR, date: dateIso, size: 22 }));
    } else if (change.type === 'deletion') {
      if (change.originalText) children.push(new DeletedTextRun({ id: revId, text: change.originalText, author: AUTHOR, date: dateIso, size: 22 }));
    }

    if (children.length > 0) {
      paragraphs.push(new Paragraph({ children, spacing: { after: 80 } }));
    }
  }

  return paragraphs;
}

exportRouter.get('/:id/export/docx', async (req, res) => {
  const [del] = await db.select().from(deliverables).where(eq(deliverables.id, req.params.id));
  if (!del || del.type !== 'redline') {
    return res.status(404).json({ error: 'Redline introuvable' });
  }

  const content = JSON.parse(del.contentJson) as RedlineContent;
  const dateNow = new Date();
  const dateIso = dateNow.toISOString();

  // Parse inline del/ins from baseHtml (new format) or fall back to changes[]
  const baseHtml = content.baseHtml ?? '';
  let bodyParagraphs: Paragraph[] = [];

  const hasInlineDiff = baseHtml.includes('<del') || baseHtml.includes('<ins');
  if (hasInlineDiff) {
    bodyParagraphs = parseHtmlToParagraphs(baseHtml, dateIso);
  } else {
    const plainText = baseHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    bodyParagraphs = buildFallbackParagraphs(plainText, content.changes ?? [], dateIso);
  }

  const doc = new Document({
    creator: AUTHOR,
    title: del.name,
    description: 'Généré par Clause AI',
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: del.name, bold: true, size: 28 })],
          spacing: { after: 400 },
        }),
        ...bodyParagraphs,
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const dateStr = dateNow.toISOString().slice(0, 10).replace(/-/g, '');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="redline_${dateStr}.docx"`);
  res.send(buffer);
});
