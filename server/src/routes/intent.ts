import { Router } from 'express';
import { z } from 'zod';
import { llm } from '../llm/index.js';
import { db } from '../db/index.js';
import { documents, referenceAssets } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const intentRouter = Router();

const ParsedIntentSchema = z.object({
  operation: z.enum([
    'confrontation', 'alignment', 'aggregation', 'dd',
    'ma_mapping', 'deadlines', 'compliance', 'inconsistencies',
    'unclear',
  ]),
  targetDocumentIds: z.array(z.string()),
  referenceDocumentId: z.string().nullable(),
  referenceAssetId: z.string().nullable(),
  suggestedName: z.string(),
  reasoning: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  clarificationNeeded: z.string().nullable(),
});

intentRouter.post('/parse', async (req, res, next) => {
  try {
    const { workspaceId, message } = req.body as { workspaceId?: string; message?: string };
    if (!workspaceId || !message) {
      res.status(400).json({ error: 'workspaceId and message required' });
      return;
    }

    const docs = await db.select().from(documents).where(eq(documents.workspaceId, workspaceId));
    const assets = await db.select().from(referenceAssets);

    const docList = docs.map(d => `- id: ${d.id} | nom: ${d.fileName} | extrait: ${d.legalExtractionStatus}`).join('\n');
    const assetList = assets.map(a => `- id: ${a.id} | type: ${a.type} | nom: ${a.name}`).join('\n');

    const systemPrompt = `Tu es un assistant qui interprète des demandes en langage naturel d'utilisateurs juridiques. Tu reçois la demande de l'utilisateur et tu identifies :

1. L'opération métier visée :
   - confrontation : audit unitaire d'un document contre un playbook
   - alignment : comparaison de deux documents
   - aggregation : constitution d'un clausier à partir de plusieurs contrats
   - dd : audit en masse pour due diligence
   - ma_mapping : mapping M&A (cartographie pour opération M&A)
   - deadlines : extraction de toutes les échéances
   - compliance : note de conformité réglementaire
   - inconsistencies : détection d'incohérences entre plusieurs documents
   - unclear : demande ambiguë

2. Les documents cibles (parmi ceux disponibles)
3. Le document de référence (pour alignment) ou l'actif (playbook/grille DD pour confrontation/dd)
4. Un nom suggéré pour l'analyse
5. Si la demande est ambiguë, une question de clarification

Retourne UNIQUEMENT un JSON valide, sans markdown.`;

    const userPrompt = `DOCUMENTS DISPONIBLES :
${docList || '(aucun)'}

ACTIFS DE RÉFÉRENCE DISPONIBLES :
${assetList || '(aucun)'}

DEMANDE UTILISATEUR :
"${message}"

Retourne le JSON suivant la structure :
{
  "operation": "confrontation|alignment|aggregation|dd|ma_mapping|deadlines|compliance|inconsistencies|unclear",
  "targetDocumentIds": ["doc_id_1", ...],
  "referenceDocumentId": "doc_id ou null",
  "referenceAssetId": "asset_id ou null",
  "suggestedName": "Nom court de l'analyse",
  "reasoning": "1-2 phrases expliquant pourquoi tu as choisi cette interprétation",
  "confidence": "high|medium|low",
  "clarificationNeeded": "question si ambigu, sinon null"
}`;

    const intent = await llm.completeStructured(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ParsedIntentSchema,
    );

    res.json(intent);
  } catch (err) {
    next(err);
  }
});
