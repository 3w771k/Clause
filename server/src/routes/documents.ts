import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { documents, textPassages, legalObjects } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { extractLegalObject, getLegalObjectFull } from '../services/extraction.service.js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export const documentsRouter = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    try {
      const result = await pdfParse(buffer);
      return result.text;
    } catch {
      return '[Extraction PDF échouée — texte indisponible]';
    }
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch {
      return '[Extraction DOCX échouée — texte indisponible]';
    }
  }
  if (mimeType === 'text/plain') {
    return buffer.toString('utf-8');
  }
  return '[Format non supporté]';
}

function splitIntoPassages(text: string): Array<{ page: number; paragraph: number; text: string; startOffset: number; endOffset: number }> {
  const passages: ReturnType<typeof splitIntoPassages> = [];
  const paragraphs = text.split(/\n{2,}/);
  let offset = 0;
  let page = 1;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (p.length < 20) { offset += paragraphs[i].length + 2; continue; }

    // Approximate page breaks every ~3000 chars
    if (offset > 0 && offset % 3000 < paragraphs[i].length) page++;

    passages.push({
      page,
      paragraph: i + 1,
      text: p,
      startOffset: offset,
      endOffset: offset + p.length,
    });
    offset += paragraphs[i].length + 2;
  }
  return passages;
}

function serializeDoc(doc: typeof documents.$inferSelect) {
  const { fileBlob, ...rest } = doc;
  return { ...rest, hasFile: fileBlob != null && (fileBlob as Buffer).length > 0 };
}

// GET /api/workspaces/:wsId/documents
documentsRouter.get('/', async (req, res) => {
  const { wsId } = req.params;
  const docs = await db.select().from(documents)
    .where(eq(documents.workspaceId, wsId))
    .orderBy(documents.uploadedAt);
  res.json(docs.map(serializeDoc));
});

// POST /api/workspaces/:wsId/documents
documentsRouter.post('/', upload.single('file'), async (req, res) => {
  const { wsId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'file is required' });

  const { originalname, mimetype, buffer, size } = req.file;
  const id = `doc_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  const extractedText = await extractText(buffer, mimetype);

  const [doc] = await db.insert(documents).values({
    id,
    workspaceId: wsId,
    fileName: originalname,
    mimeType: mimetype,
    sizeBytes: size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'demo-user',
    extractedText,
    conversionMode: 'standard',
    language: 'fr',
    legalExtractionStatus: 'none',
    fileBlob: buffer,
  }).returning();

  // Insert text passages
  const passages = splitIntoPassages(extractedText);
  for (const p of passages) {
    await db.insert(textPassages).values({
      id: `tp_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
      documentId: id,
      ...p,
    });
  }

  res.status(201).json(doc);
});

// GET /api/workspaces/:wsId/documents/:id
documentsRouter.get('/:id', async (req, res) => {
  const [doc] = await db.select().from(documents)
    .where(and(eq(documents.id, req.params.id), eq(documents.workspaceId, req.params.wsId)));
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json(serializeDoc(doc));
});

// DELETE /api/workspaces/:wsId/documents/:id
documentsRouter.delete('/:id', async (req, res) => {
  await db.delete(documents)
    .where(and(eq(documents.id, req.params.id), eq(documents.workspaceId, req.params.wsId)));
  res.status(204).send();
});

// GET /api/workspaces/:wsId/documents/:id/passages
documentsRouter.get('/:id/passages', async (req, res) => {
  const passages = await db.select().from(textPassages)
    .where(eq(textPassages.documentId, req.params.id))
    .orderBy(textPassages.page, textPassages.paragraph);
  res.json(passages);
});

// POST /api/workspaces/:wsId/documents/:id/extract  — trigger legal extraction
documentsRouter.post('/:id/extract', async (req, res) => {
  const [doc] = await db.select().from(documents)
    .where(and(eq(documents.id, req.params.id), eq(documents.workspaceId, req.params.wsId)));
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  if (doc.legalExtractionStatus === 'processing') {
    return res.status(409).json({ error: 'Extraction already in progress' });
  }

  // Start async — return immediately with 202
  extractLegalObject(req.params.id).catch((err) =>
    console.error(`Extraction failed for ${req.params.id}:`, err),
  );

  res.status(202).json({ message: 'Extraction started', documentId: req.params.id });
});

// GET /api/workspaces/:wsId/documents/:id/file  — stream raw binary
documentsRouter.get('/:id/file', async (req, res) => {
  const [doc] = await db.select().from(documents)
    .where(and(eq(documents.id, req.params.id), eq(documents.workspaceId, req.params.wsId)));
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!doc.fileBlob) return res.status(404).json({ error: 'No file stored for this document' });

  res.setHeader('Content-Type', doc.mimeType ?? 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
  res.send(doc.fileBlob);
});

// GET /api/workspaces/:wsId/documents/:id/legal-object
documentsRouter.get('/:id/legal-object', async (req, res) => {
  const [doc] = await db.select().from(documents)
    .where(and(eq(documents.id, req.params.id), eq(documents.workspaceId, req.params.wsId)));
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!doc.legalObjectId) return res.status(404).json({ error: 'No legal object extracted yet' });

  const lo = await getLegalObjectFull(doc.legalObjectId);
  if (!lo) return res.status(404).json({ error: 'Legal object not found' });
  res.json(lo);
});
