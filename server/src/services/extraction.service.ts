import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { documents, legalObjects, clauses, definedTerms, textPassages, clauseEmbeddings, crossReferences } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { llm } from '../llm/index.js';
import { LegalExtractionResultSchema } from '../types/api.js';
import type { LegalExtractionResult } from '../types/api.js';
import maisontOntology from '../ontologies/maison.json' assert { type: 'json' };
import { embedPassage, vectorToBuffer } from '../embeddings/embedding.service.js';

// ─── Mock extraction for pre-alpha (no real PDF parsing yet) ──────────────────

function buildExtractionPrompt(text: string): string {
  const clauseTypes = (maisontOntology as { clauseTypes: Array<{ id: string; name: string; category: string }> })
    .clauseTypes.map((c) => `${c.id}: ${c.name} (${c.category})`).join('\n');

  return `Tu es un assistant juridique expert. Extrais les informations structurées du contrat suivant.

Retourne un JSON valide avec la structure exacte suivante :
{
  "documentType": "string (ex: CONTRAT, AVENANT, MEMO)",
  "documentSubtype": "string ou null (ex: NDA_MUTUEL, PRESTATION_SERVICES)",
  "language": "fr",
  "overallConfidence": "high|medium|low",
  "metadata": {
    "parties": [],
    "date": null,
    "duration": null,
    "governingLaw": null
  },
  "clauses": [
    {
      "id": "uuid",
      "type": "TYPE_DE_CLAUSE (parmi la liste ci-dessous)",
      "heading": "titre de la clause ou null",
      "sequenceNumber": "ex: 1, 2.1 ou null",
      "text": "texte complet de la clause",
      "attributes": {},
      "confidence": "high|medium|low",
      "linkedDefinedTerms": []
    }
  ],
  "definedTerms": [
    {
      "id": "uuid",
      "term": "terme défini",
      "definition": "définition complète",
      "confidence": "high"
    }
  ]
}

Types de clauses disponibles :
${clauseTypes}

Texte du contrat :
${text.substring(0, 8000)}`;
}

export async function extractLegalObject(documentId: string): Promise<string> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) throw new Error(`Document ${documentId} not found`);

  await db.update(documents)
    .set({ legalExtractionStatus: 'processing', lastExtractionAt: new Date().toISOString() })
    .where(eq(documents.id, documentId));

  try {
    const prompt = buildExtractionPrompt(doc.extractedText);
    const result: LegalExtractionResult = await llm.completeStructured(
      [
        { role: 'system', content: 'Tu es un expert juridique. Retourne uniquement du JSON valide.' },
        { role: 'user', content: prompt },
      ],
      LegalExtractionResultSchema,
    );

    const loId = `lo_${uuidv4().replace(/-/g, '').substring(0, 12)}`;

    await db.insert(legalObjects).values({
      id: loId,
      documentId,
      ontologyId: 'maison',
      extractedAt: new Date().toISOString(),
      extractionVersion: 1,
      documentType: result.documentType,
      documentSubtype: result.documentSubtype ?? null,
      language: result.language,
      overallConfidence: result.overallConfidence,
      metadataJson: JSON.stringify(result.metadata),
      userEditsJson: '[]',
    });

    const insertedClauses: Array<{ id: string; type: string; heading: string | null; text: string }> = [];
    for (let i = 0; i < result.clauses.length; i++) {
      const c = result.clauses[i];
      const clauseId = `cl_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
      await db.insert(clauses).values({
        id: clauseId,
        legalObjectId: loId,
        type: c.type,
        heading: c.heading ?? null,
        sequenceNumber: c.sequenceNumber ?? null,
        clauseOrder: i,
        text: c.text,
        citationJson: '{}',
        attributesJson: JSON.stringify(c.attributes),
        confidence: c.confidence,
        isUserAdded: false,
        isUserModified: false,
        linkedDefinedTerms: JSON.stringify(c.linkedDefinedTerms),
        linkedClauses: '[]',
      });
      insertedClauses.push({ id: clauseId, type: c.type, heading: c.heading ?? null, text: c.text });
    }

    for (const clause of insertedClauses) {
      const textToEmbed = `[${clause.type}] ${clause.heading ?? ''}\n${clause.text}`.trim();
      try {
        const vector = await embedPassage(textToEmbed);
        await db.insert(clauseEmbeddings).values({
          clauseId: clause.id,
          vector: vectorToBuffer(vector),
          model: 'multilingual-e5-small',
        });
      } catch (err) {
        console.error('[embeddings] failed to embed clause', clause.id, err);
      }
    }

    for (const dt of result.definedTerms) {
      await db.insert(definedTerms).values({
        id: `dt_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
        legalObjectId: loId,
        term: dt.term,
        definition: dt.definition,
        citationJson: '{}',
        confidence: dt.confidence,
        referencedInClauses: '[]',
      });
    }

    await db.update(documents)
      .set({ legalExtractionStatus: 'done', legalObjectId: loId })
      .where(eq(documents.id, documentId));

    return loId;
  } catch (err) {
    await db.update(documents)
      .set({
        legalExtractionStatus: 'error',
        extractionError: err instanceof Error ? err.message : String(err),
      })
      .where(eq(documents.id, documentId));
    throw err;
  }
}

export async function getLegalObjectFull(loId: string) {
  const [lo] = await db.select().from(legalObjects).where(eq(legalObjects.id, loId));
  if (!lo) return null;

  const clauseRows = await db.select().from(clauses)
    .where(eq(clauses.legalObjectId, loId))
    .orderBy(clauses.clauseOrder);

  const termRows = await db.select().from(definedTerms)
    .where(eq(definedTerms.legalObjectId, loId));

  const crossRefRows = await db.select().from(crossReferences)
    .where(eq(crossReferences.legalObjectId, loId));

  return {
    ...lo,
    metadata: JSON.parse(lo.metadataJson),
    userEdits: JSON.parse(lo.userEditsJson),
    clauses: clauseRows.map((c) => ({
      ...c,
      citation: JSON.parse(c.citationJson),
      attributes: JSON.parse(c.attributesJson),
      linkedDefinedTerms: JSON.parse(c.linkedDefinedTerms),
      linkedClauses: JSON.parse(c.linkedClauses),
    })),
    definedTerms: termRows.map((dt) => ({
      ...dt,
      citation: JSON.parse(dt.citationJson),
      referencedInClauses: JSON.parse(dt.referencedInClauses),
    })),
    crossReferences: crossRefRows.map((cr) => ({
      ...cr,
      citation: JSON.parse(cr.citationJson),
    })),
  };
}
