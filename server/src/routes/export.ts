import { Router } from 'express';
import { Document, Packer, Paragraph, TextRun, InsertedTextRun, DeletedTextRun } from 'docx';
import { db } from '../db/index.js';
import { deliverables } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const exportRouter = Router();

interface RedlineChange {
  id: string;
  type: 'replacement' | 'insertion' | 'deletion';
  originalText: string;
  newText: string;
  clauseContext: string;
  rationale: string;
  status: 'pending' | 'accepted' | 'rejected';
}

interface RedlineContent {
  type: 'redline';
  targetDocumentId: string;
  baseHtml: string;
  changes: RedlineChange[];
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

exportRouter.get('/:id/export/docx', async (req, res) => {
  const [del] = await db.select().from(deliverables).where(eq(deliverables.id, req.params.id));
  if (!del || del.type !== 'redline') {
    return res.status(404).json({ error: 'Redline introuvable' });
  }

  const content = JSON.parse(del.contentJson) as RedlineContent;
  const changes = content.changes ?? [];
  const baseText = stripHtml(content.baseHtml ?? '');

  const AUTHOR = 'Clause AI';
  const dateNow = new Date();
  const dateStr_iso = dateNow.toISOString();

  // Génère les paragraphes du document
  const paragraphs: Paragraph[] = [];

  // Titre
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: del.name, bold: true, size: 28 })],
      spacing: { after: 400 },
    })
  );

  // Texte de base
  if (baseText) {
    const sentences = baseText.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (sentence.trim()) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: sentence.trim(), size: 22 })],
            spacing: { after: 120 },
          })
        );
      }
    }
  }

  // Section des modifications avec révisions natives
  const relevantChanges = changes.filter(c => c.status === 'pending' || c.status === 'accepted');
  if (relevantChanges.length > 0) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: '', break: 1 })],
      })
    );
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: 'Modifications suggérées', bold: true, size: 26 })],
        spacing: { before: 400, after: 200 },
      })
    );

    for (let idx = 0; idx < relevantChanges.length; idx++) {
      const change = relevantChanges[idx];
      const revId = idx + 1;

      // Titre de la modification
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: `[${change.clauseContext}] `, bold: true, size: 20 }),
            new TextRun({ text: change.rationale, italics: true, size: 20, color: '666666' }),
          ],
          spacing: { before: 200, after: 80 },
        })
      );

      const children = [];

      if (change.type === 'replacement') {
        if (change.originalText) {
          children.push(
            new DeletedTextRun({
              id: revId,
              text: change.originalText,
              author: AUTHOR,
              date: dateStr_iso,
            })
          );
        }
        if (change.newText) {
          children.push(
            new InsertedTextRun({
              id: revId,
              text: change.newText,
              author: AUTHOR,
              date: dateStr_iso,
            })
          );
        }
      } else if (change.type === 'insertion') {
        if (change.newText) {
          children.push(
            new InsertedTextRun({
              id: revId,
              text: change.newText,
              author: AUTHOR,
              date: dateStr_iso,
            })
          );
        }
      } else if (change.type === 'deletion') {
        if (change.originalText) {
          children.push(
            new DeletedTextRun({
              id: revId,
              text: change.originalText,
              author: AUTHOR,
              date: dateStr_iso,
            })
          );
        }
      }

      if (children.length > 0) {
        paragraphs.push(
          new Paragraph({ children, spacing: { after: 80 } })
        );
      }
    }
  }

  const doc = new Document({
    creator: AUTHOR,
    title: del.name,
    description: 'Généré par Clause AI',
    sections: [{ properties: {}, children: paragraphs }],
  });

  const buffer = await Packer.toBuffer(doc);
  const dateStr = dateNow.toISOString().slice(0, 10).replace(/-/g, '');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="redline_${dateStr}.docx"`);
  res.send(buffer);
});
