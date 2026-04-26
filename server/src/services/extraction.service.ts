import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { documents, legalObjects, clauses, definedTerms, textPassages } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { llm } from '../llm/index.js';
import { LegalExtractionResultSchema } from '../types/api.js';
import type { LegalExtractionResult } from '../types/api.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import frOntologyRaw from '../ontologies/maison-fr.json';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import enOntologyRaw from '../ontologies/maison-en.json';
const frOntology = frOntologyRaw as unknown as { clauseTypes: OntologyClauseType[] };
const enOntology = enOntologyRaw as unknown as { clauseTypes: OntologyClauseType[] };

type OntologyAttr = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  description: string;
  values?: string[];
};

type OntologyClauseType = {
  id: string;
  name: string;
  category: string;
  attributes: OntologyAttr[];
};

function detectLanguage(text: string): 'fr' | 'en' {
  const sample = text.substring(0, 2000).toLowerCase();
  const frScore = (sample.match(/\b(le|la|les|de|du|des|un|une|que|qui|est|dans|pour|avec|sur|par|tout|contrat|article|clause|société|parties|prestataire|conformément|ci-après|présent)\b/g) || []).length;
  const enScore = (sample.match(/\b(the|of|and|to|in|is|for|with|on|by|this|that|shall|party|parties|agreement|contract|company|services|provider|client|pursuant|hereby|thereof|whereas|herein)\b/g) || []).length;
  return frScore >= enScore ? 'fr' : 'en';
}

function buildAttributeSpec(attrs: OntologyAttr[]): string {
  if (!attrs?.length) return '';
  return ' → ' + attrs.map(a => {
    const typeStr = a.values?.length ? `enum(${a.values.join('|')})` : a.type;
    return `${a.key}(${typeStr}):"${a.description}"`;
  }).join(', ');
}

function buildExtractionPrompt(text: string, lang: 'fr' | 'en'): string {
  const ontology = lang === 'fr' ? frOntology : enOntology;
  const clauseTypeList = ontology.clauseTypes
    .map(c => `${c.id}: ${c.name}${buildAttributeSpec(c.attributes)}`)
    .join('\n');

  if (lang === 'en') {
    return `You are an expert legal assistant. Extract structured information from the following contract.

Return valid JSON with the exact following structure:
{
  "documentType": "string (e.g. AGREEMENT, AMENDMENT, NDA)",
  "documentSubtype": "string or null",
  "language": "en",
  "overallConfidence": "high|medium|low",
  "metadata": {
    "parties": [{ "name": "...", "role": "...", "citation": { "page": null, "extract": null } }],
    "date": { "value": "YYYY-MM-DD or null", "confidence": "high|medium|low" },
    "duration": { "value": "...", "confidence": "high|medium|low" },
    "governingLaw": { "value": "...", "confidence": "high|medium|low" }
  },
  "clauses": [
    {
      "id": "uuid",
      "type": "CLAUSE_TYPE (from list below)",
      "heading": "clause title or null",
      "sequenceNumber": "e.g. 1, 2.1 or null",
      "text": "full clause text",
      "attributes": { "key": value_or_null },
      "confidence": "high|medium|low",
      "linkedDefinedTerms": []
    }
  ],
  "definedTerms": [
    {
      "id": "uuid",
      "term": "defined term",
      "definition": "full definition",
      "confidence": "high"
    }
  ]
}

For "attributes": use ONLY the keys listed for each clause type below. Set value to null if not found in the text. Do not invent keys that are not listed.

Available clause types (format: ID: name → key(type):"description"):
${clauseTypeList}

Contract text:
${text.substring(0, 60000)}`;
  }

  return `Tu es un assistant juridique expert. Extrais les informations structurées du contrat suivant.

Retourne un JSON valide avec la structure exacte suivante :
{
  "documentType": "string (ex: CONTRAT, AVENANT, NDA, MEMO)",
  "documentSubtype": "string ou null (ex: NDA_MUTUEL, PRESTATION_SERVICES)",
  "language": "fr",
  "overallConfidence": "high|medium|low",
  "metadata": {
    "parties": [{ "name": "...", "role": "...", "citation": { "page": null, "extract": null } }],
    "date": { "value": "YYYY-MM-DD ou null", "confidence": "high|medium|low" },
    "duration": { "value": "...", "confidence": "high|medium|low" },
    "governingLaw": { "value": "...", "confidence": "high|medium|low" }
  },
  "clauses": [
    {
      "id": "uuid",
      "type": "TYPE_DE_CLAUSE (parmi la liste ci-dessous)",
      "heading": "titre de la clause ou null",
      "sequenceNumber": "ex: 1, 2.1 ou null",
      "text": "texte complet de la clause",
      "attributes": { "clé": valeur_ou_null },
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

Pour "attributes" : utilise UNIQUEMENT les clés listées pour chaque type de clause ci-dessous. Mets null si l'attribut est absent du texte. N'invente pas de clés supplémentaires.

Types de clauses disponibles (format : ID: nom → clé(type):"description") :
${clauseTypeList}

Texte du contrat :
${text.substring(0, 60000)}`;
}

export async function extractLegalObject(documentId: string): Promise<string> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) throw new Error(`Document ${documentId} not found`);

  await db.update(documents)
    .set({ legalExtractionStatus: 'processing', lastExtractionAt: new Date().toISOString() })
    .where(eq(documents.id, documentId));

  try {
    const lang = detectLanguage(doc.extractedText);
    const prompt = buildExtractionPrompt(doc.extractedText, lang);

    const result = await llm.completeStructured(
      [
        {
          role: 'system',
          content: lang === 'en'
            ? 'You are a legal expert. Return only valid JSON.'
            : 'Tu es un expert juridique. Retourne uniquement du JSON valide.',
        },
        { role: 'user', content: prompt },
      ],
      LegalExtractionResultSchema,
    ) as LegalExtractionResult;

    const loId = `lo_${uuidv4().replace(/-/g, '').substring(0, 12)}`;

    await db.insert(legalObjects).values({
      id: loId,
      documentId,
      ontologyId: 'maison',
      extractedAt: new Date().toISOString(),
      extractionVersion: 1,
      documentType: result.documentType,
      documentSubtype: result.documentSubtype ?? null,
      language: result.language ?? lang,
      overallConfidence: result.overallConfidence,
      metadataJson: JSON.stringify(result.metadata),
      userEditsJson: '[]',
    });

    for (let i = 0; i < result.clauses.length; i++) {
      const c = result.clauses[i];
      await db.insert(clauses).values({
        id: `cl_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
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
  };
}
