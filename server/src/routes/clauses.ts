import { Router } from 'express';
import { db } from '../db/index.js';
import { clauses, clauseEmbeddings, legalObjects, documents } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { bufferToVector, cosine } from '../embeddings/embedding.service.js';
import { llm } from '../llm/index.js';

export const clausesRouter = Router();

clausesRouter.get('/:clauseId/similar', async (req, res, next) => {
  try {
    const { clauseId } = req.params;
    const workspaceId = req.query.workspaceId as string | undefined;
    const limit = Math.min(Number(req.query.limit ?? 5), 20);

    if (!workspaceId) {
      res.status(400).json({ error: 'workspaceId query param is required' });
      return;
    }

    const [source] = await db.select().from(clauses).where(eq(clauses.id, clauseId));
    if (!source) {
      res.status(404).json({ error: 'Clause not found' });
      return;
    }
    const [sourceEmb] = await db.select().from(clauseEmbeddings).where(eq(clauseEmbeddings.clauseId, clauseId));
    if (!sourceEmb) {
      res.json({ source: { id: source.id }, similar: [], note: 'Source clause has no embedding' });
      return;
    }
    const sourceVec = bufferToVector(sourceEmb.vector as Buffer);

    const sourceLegalObject = await db.select().from(legalObjects).where(eq(legalObjects.id, source.legalObjectId));
    const sourceDocId = sourceLegalObject[0]?.documentId;

    const wsDocs = await db.select().from(documents).where(eq(documents.workspaceId, workspaceId));
    const otherDocIds = wsDocs.map(d => d.id).filter(id => id !== sourceDocId);
    if (otherDocIds.length === 0) {
      res.json({ source: { id: source.id }, similar: [] });
      return;
    }
    const otherLegalObjects = await db.select().from(legalObjects).where(inArray(legalObjects.documentId, otherDocIds));
    const otherLoIds = otherLegalObjects.map(lo => lo.id);
    if (otherLoIds.length === 0) {
      res.json({ source: { id: source.id }, similar: [] });
      return;
    }

    const candidateClauses = await db.select().from(clauses).where(inArray(clauses.legalObjectId, otherLoIds));
    const candidateIds = candidateClauses.map(c => c.id);
    if (candidateIds.length === 0) {
      res.json({ source: { id: source.id }, similar: [] });
      return;
    }
    const embeddings = await db.select().from(clauseEmbeddings).where(inArray(clauseEmbeddings.clauseId, candidateIds));

    const embByClauseId = new Map(embeddings.map(e => [e.clauseId, e]));
    const scored = candidateClauses
      .map(c => {
        const emb = embByClauseId.get(c.id);
        if (!emb) return null;
        const v = bufferToVector(emb.vector as Buffer);
        const score = cosine(sourceVec, v);
        return { clause: c, score };
      })
      .filter((x): x is { clause: typeof candidateClauses[0]; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const docByLoId = new Map<string, string>();
    for (const lo of otherLegalObjects) {
      const doc = wsDocs.find(d => d.id === lo.documentId);
      if (doc) docByLoId.set(lo.id, doc.fileName);
    }

    res.json({
      source: { id: source.id, type: source.type, heading: source.heading, text: source.text },
      similar: scored.map(({ clause, score }) => ({
        id: clause.id,
        type: clause.type,
        heading: clause.heading,
        text: clause.text,
        legalObjectId: clause.legalObjectId,
        documentName: docByLoId.get(clause.legalObjectId) ?? 'Document inconnu',
        similarity: Math.round(score * 1000) / 1000,
      })),
    });
  } catch (err) {
    next(err);
  }
});

clausesRouter.post('/:clauseId/ask', async (req, res, next) => {
  try {
    const { clauseId } = req.params;
    const { question } = req.body as { question?: string };
    if (!question) {
      res.status(400).json({ error: 'question is required' });
      return;
    }

    const [clause] = await db.select().from(clauses).where(eq(clauses.id, clauseId));
    if (!clause) {
      res.status(404).json({ error: 'Clause not found' });
      return;
    }

    const systemPrompt = `Tu es un assistant juridique. Réponds de façon courte et précise (3-5 phrases max) à la question de l'utilisateur sur la clause fournie. Reste factuel.`;
    const userPrompt = `CLAUSE :
Type : ${clause.type}
${clause.heading ? `Titre : ${clause.heading}\n` : ''}Texte :
${clause.text}

QUESTION : ${question}

Réponse :`;

    const response = await llm.complete(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 500 },
    );

    res.json({ answer: response.content });
  } catch (err) {
    next(err);
  }
});
