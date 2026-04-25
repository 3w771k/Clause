import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import {
  analyses, analysisDocuments, conversationMessages, deliverables, legalObjects, documents,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { handleUserMessage, runAlignment, runConfrontation, runAggregation, runDD, runMaMapping, runDeadlines, runCompliance, runInconsistencies } from '../services/analysis.service.js';

export const analysesRouter = Router({ mergeParams: true });

// ─── List / Create (scoped to workspace) ─────────────────────────────────────

analysesRouter.get('/', async (req, res) => {
  const { wsId } = req.params;
  const rows = await db.select().from(analyses)
    .where(eq(analyses.workspaceId, wsId))
    .orderBy(analyses.lastActivityAt);
  res.json(rows);
});

analysesRouter.post('/', async (req, res) => {
  const { wsId } = req.params;
  const { name, operation, referenceAssetId } = req.body as {
    name: string; operation?: string; referenceAssetId?: string;
  };
  if (!name) return res.status(400).json({ error: 'name is required' });

  const now = new Date().toISOString();
  const [row] = await db.insert(analyses).values({
    id: `ana_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
    workspaceId: wsId,
    name,
    createdAt: now,
    lastActivityAt: now,
    status: 'active',
    operation: operation ?? 'unclear',
    referenceAssetId: referenceAssetId ?? null,
  }).returning();
  res.status(201).json(row);
});

// ─── Single analysis ──────────────────────────────────────────────────────────

analysesRouter.get('/:anaId', async (req, res) => {
  const { wsId, anaId } = req.params;
  const [ana] = await db.select().from(analyses)
    .where(and(eq(analyses.id, anaId), eq(analyses.workspaceId, wsId)));
  if (!ana) return res.status(404).json({ error: 'Analysis not found' });

  const adRows = await db.select().from(analysisDocuments)
    .where(eq(analysisDocuments.analysisId, anaId))
    .orderBy(analysisDocuments.orderInAnalysis);

  const docDetails = await Promise.all(
    adRows.map(async (ad) => {
      const [lo] = await db.select().from(legalObjects).where(eq(legalObjects.id, ad.legalObjectId));
      if (!lo) return { ...ad, documentName: null };
      const [doc] = await db.select({ fileName: documents.fileName })
        .from(documents).where(eq(documents.id, lo.documentId));
      return {
        ...ad,
        documentName: doc?.fileName ?? lo.id,
        documentType: lo.documentType,
        documentSubtype: lo.documentSubtype,
      };
    }),
  );

  const delivRows = await db.select({
    id: deliverables.id,
    type: deliverables.type,
    name: deliverables.name,
    status: deliverables.status,
    createdAt: deliverables.createdAt,
    sourceOperation: deliverables.sourceOperation,
  }).from(deliverables).where(eq(deliverables.analysisId, anaId));

  res.json({ ...ana, documents: docDetails, deliverables: delivRows });
});

analysesRouter.delete('/:anaId', async (req, res) => {
  await db.delete(analyses).where(
    and(eq(analyses.id, req.params.anaId), eq(analyses.workspaceId, req.params.wsId)),
  );
  res.status(204).send();
});

// ─── Analysis documents ───────────────────────────────────────────────────────

analysesRouter.post('/:anaId/documents', async (req, res) => {
  const { anaId } = req.params;
  const { legalObjectId, role } = req.body as { legalObjectId: string; role?: string };
  if (!legalObjectId) return res.status(400).json({ error: 'legalObjectId is required' });

  const [lo] = await db.select().from(legalObjects).where(eq(legalObjects.id, legalObjectId));
  if (!lo) return res.status(404).json({ error: 'Legal object not found' });

  const existing = await db.select().from(analysisDocuments)
    .where(and(eq(analysisDocuments.analysisId, anaId), eq(analysisDocuments.legalObjectId, legalObjectId)));
  if (existing.length) return res.status(409).json({ error: 'Document already in analysis' });

  const count = await db.select().from(analysisDocuments).where(eq(analysisDocuments.analysisId, anaId));

  const [row] = await db.insert(analysisDocuments).values({
    id: `ad_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
    analysisId: anaId,
    legalObjectId,
    role: role ?? 'target',
    addedAt: new Date().toISOString(),
    orderInAnalysis: count.length,
  }).returning();
  res.status(201).json(row);
});

analysesRouter.delete('/:anaId/documents/:adId', async (req, res) => {
  await db.delete(analysisDocuments).where(
    and(eq(analysisDocuments.id, req.params.adId), eq(analysisDocuments.analysisId, req.params.anaId)),
  );
  res.status(204).send();
});

// ─── Conversation ─────────────────────────────────────────────────────────────

analysesRouter.get('/:anaId/messages', async (req, res) => {
  const messages = await db.select().from(conversationMessages)
    .where(eq(conversationMessages.analysisId, req.params.anaId))
    .orderBy(conversationMessages.timestamp);
  res.json(
    messages.map((m) => ({
      ...m,
      deliverableReferences: JSON.parse(m.deliverableReferences),
      citations: JSON.parse(m.citationsJson),
      interpretedIntent: m.interpretedIntentJson ? JSON.parse(m.interpretedIntentJson) : null,
    })),
  );
});

analysesRouter.post('/:anaId/messages', async (req, res) => {
  const { anaId, wsId } = req.params;
  const { content } = req.body as { content: string };
  if (!content?.trim()) return res.status(400).json({ error: 'content is required' });

  const [ana] = await db.select().from(analyses)
    .where(and(eq(analyses.id, anaId), eq(analyses.workspaceId, wsId)));
  if (!ana) return res.status(404).json({ error: 'Analysis not found' });

  const now = new Date().toISOString();
  const userMsgId = `msg_${uuidv4().replace(/-/g, '').substring(0, 12)}`;

  await db.insert(conversationMessages).values({
    id: userMsgId,
    analysisId: anaId,
    timestamp: now,
    role: 'user',
    content,
    deliverableReferences: '[]',
    citationsJson: '[]',
  });

  // Insert a placeholder assistant message immediately so the frontend can display it
  const asstMsgId = `msg_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  await db.insert(conversationMessages).values({
    id: asstMsgId,
    analysisId: anaId,
    timestamp: new Date().toISOString(),
    role: 'assistant',
    content: '⏳ Traitement en cours...',
    deliverableReferences: '[]',
    citationsJson: '[]',
  });

  // Respond immediately — LLM work happens in the background
  res.status(201).json({
    userMessageId: userMsgId,
    assistantMessage: {
      id: asstMsgId,
      analysisId: anaId,
      timestamp: new Date().toISOString(),
      role: 'assistant',
      content: '⏳ Traitement en cours...',
      deliverableReferences: [],
      citations: [],
    },
    deliverableIds: [],
  });

  // Run the actual LLM work in background — update the message when done
  setImmediate(async () => {
    let assistantContent: string;
    let deliverableIds: string[];
    try {
      ({ assistantMessage: assistantContent, deliverableIds } = await handleUserMessage(anaId, content));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('handleUserMessage error:', errMsg);
      assistantContent = `Une erreur est survenue : ${errMsg}`;
      deliverableIds = [];
    }

    await db.update(conversationMessages)
      .set({
        content: assistantContent,
        deliverableReferences: JSON.stringify(deliverableIds),
      })
      .where(eq(conversationMessages.id, asstMsgId));

    await db.update(analyses)
      .set({ lastActivityAt: new Date().toISOString() })
      .where(eq(analyses.id, anaId));

    console.log(`[${anaId}] Message processed, deliverables: ${deliverableIds}`);
  });
});

// ─── Start generation (called by wizard after creating analysis + docs) ───────

analysesRouter.post('/:anaId/start-generation', async (req, res) => {
  const { anaId, wsId } = req.params;

  const [ana] = await db.select().from(analyses)
    .where(and(eq(analyses.id, anaId), eq(analyses.workspaceId, wsId)));
  if (!ana) return res.status(404).json({ error: 'Analysis not found' });

  const operation = ana.operation ?? 'unclear';

  const operationMessages: Record<string, string> = {
    alignment:       'Comparez les documents et générez la note comparative et le redline.',
    confrontation:   'Auditez ce contrat contre le référentiel et générez la note de revue.',
    aggregation:     'Constituez le clausier à partir des documents sources.',
    dd:              'Réalisez la due diligence sur ces documents et générez la synthèse et le tableau de risques.',
    ma_mapping:      'Cartographiez les engagements à fort enjeu de transfert dans ce corpus.',
    deadlines:       'Extrayez toutes les échéances contractuelles et délais.',
    compliance:      'Auditez la conformité réglementaire de ces contrats.',
    inconsistencies: 'Détectez les incohérences entre clauses du même type dans ce corpus.',
    unclear:         'Analysez les documents.',
  };
  const systemMessage = operationMessages[operation] ?? operationMessages['unclear'];

  const now = new Date().toISOString();
  const userMsgId = `msg_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  const asstMsgId = `msg_${uuidv4().replace(/-/g, '').substring(0, 12)}`;

  await db.insert(conversationMessages).values({
    id: userMsgId,
    analysisId: anaId,
    timestamp: now,
    role: 'user',
    content: systemMessage,
    deliverableReferences: '[]',
    citationsJson: '[]',
  });

  await db.insert(conversationMessages).values({
    id: asstMsgId,
    analysisId: anaId,
    timestamp: new Date().toISOString(),
    role: 'assistant',
    content: '⏳ Traitement en cours...',
    deliverableReferences: '[]',
    citationsJson: '[]',
  });

  res.status(202).json({ assistantMessageId: asstMsgId });

  setImmediate(async () => {
    let assistantContent: string;
    let deliverableIds: string[] = [];
    try {
      if (operation === 'alignment') {
        deliverableIds = await runAlignment(anaId);
        assistantContent = `J'ai comparé les documents et généré **${deliverableIds.length} livrable(s)** : une note comparative et un redline. Vous pouvez les consulter dans le panneau de droite.\n\nSouhaitez-vous que je développe un point particulier ?`;
      } else if (operation === 'confrontation') {
        deliverableIds = await runConfrontation(anaId);
        assistantContent = `J'ai audité le contrat contre le référentiel et généré la **note de revue**. Consultez-la dans le panneau de droite.\n\nSouhaitez-vous approfondir un point ou demander une reformulation de clause ?`;
      } else if (operation === 'aggregation') {
        deliverableIds = await runAggregation(anaId);
        assistantContent = `Le **clausier** a été constitué à partir des documents sources. Consultez-le dans le panneau de droite.\n\nSouhaitez-vous ajouter ou affiner des clauses ?`;
      } else if (operation === 'dd') {
        deliverableIds = await runDD(anaId);
        assistantContent = `J'ai réalisé la due diligence et généré **${deliverableIds.length} livrable(s)** : une synthèse et un tableau de risques. Consultez-les dans le panneau de droite.\n\nSouhaitez-vous approfondir un point particulier ?`;
      } else if (operation === 'ma_mapping') {
        deliverableIds = await runMaMapping(anaId);
        assistantContent = `J'ai cartographié les engagements à fort enjeu de transfert. Le tableau est disponible dans le panneau de droite.\n\nSouhaitez-vous approfondir une clause en particulier ?`;
      } else if (operation === 'deadlines') {
        deliverableIds = await runDeadlines(anaId);
        assistantContent = `J'ai extrait toutes les échéances contractuelles. Les délais dans les 90 jours sont mis en évidence.\n\nSouhaitez-vous des précisions sur une échéance ?`;
      } else if (operation === 'compliance') {
        deliverableIds = await runCompliance(anaId);
        assistantContent = `L'audit de conformité réglementaire est disponible dans le panneau de droite.\n\nSouhaitez-vous approfondir un point de non-conformité ?`;
      } else if (operation === 'inconsistencies') {
        deliverableIds = await runInconsistencies(anaId);
        assistantContent = `J'ai détecté les incohérences inter-contrats. Les divergences sont classées par niveau dans le panneau de droite.\n\nSouhaitez-vous analyser une clause en particulier ?`;
      } else {
        assistantContent = 'Analyse prête. Que souhaitez-vous faire avec ces documents ?';
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[start-generation][${anaId}] Error: ${msg}`);
      assistantContent = 'La génération a rencontré un problème. Souhaitez-vous réessayer ?';
    }

    await db.update(conversationMessages)
      .set({ content: assistantContent, deliverableReferences: JSON.stringify(deliverableIds) })
      .where(eq(conversationMessages.id, asstMsgId));

    await db.update(analyses)
      .set({ lastActivityAt: new Date().toISOString() })
      .where(eq(analyses.id, anaId));

    console.log(`[start-generation][${anaId}] Done. deliverables: ${deliverableIds}`);
  });
});
