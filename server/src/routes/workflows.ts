// Brief 6: les workflows OOTB sont devenus des ReferenceAssets de type
// 'tabular_workflow'. Cet endpoint reste pour compatibilité descendante mais
// re-projette le format historique attendu par le frontend.
// À retirer quand le frontend aura migré vers /api/reference-base?type=tabular_workflow.

import { Router } from 'express';
import { db } from '../db/index.js';
import { referenceAssets } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const workflowsRouter = Router();

interface LegacyWorkflow {
  id: string;
  name: string;
  description: string;
  kind: string;
  applicableDocumentTypes: string[];
  language: string;
  definition: {
    columns: Array<{
      label: string; question: string; expectedType: string;
      extractionStrategy?: string; clauseTypeOntologyId?: string; attributePath?: string;
    }>;
  };
}

interface TabularWorkflowContent {
  schemaVersion: number;
  applicableDocumentTypes: string[];
  columns: Array<{
    id?: string; label: string; question: string; expectedType: string; order?: number;
    extractionStrategy?: string; clauseTypeOntologyId?: string; attributePath?: string;
  }>;
}

function assetToLegacy(asset: typeof referenceAssets.$inferSelect): LegacyWorkflow {
  let content: TabularWorkflowContent;
  try {
    content = JSON.parse(asset.contentJson) as TabularWorkflowContent;
  } catch {
    content = { schemaVersion: 1, applicableDocumentTypes: [], columns: [] };
  }
  return {
    id: asset.id.replace(/^wf_/, ''),
    name: asset.name,
    description: asset.description,
    kind: 'tabular_review_preset',
    applicableDocumentTypes: content.applicableDocumentTypes ?? [],
    language: asset.language,
    definition: {
      columns: (content.columns ?? []).map(c => ({
        label: c.label,
        question: c.question,
        expectedType: c.expectedType,
        ...(c.extractionStrategy && { extractionStrategy: c.extractionStrategy }),
        ...(c.clauseTypeOntologyId && { clauseTypeOntologyId: c.clauseTypeOntologyId }),
        ...(c.attributePath && { attributePath: c.attributePath }),
      })),
    },
  };
}

workflowsRouter.get('/', async (_req, res) => {
  const assets = await db.select().from(referenceAssets)
    .where(eq(referenceAssets.type, 'tabular_workflow'))
    .orderBy(referenceAssets.name);
  res.json(assets.map(assetToLegacy));
});

workflowsRouter.get('/:id', async (req, res) => {
  const assetId = req.params.id.startsWith('wf_') ? req.params.id : `wf_${req.params.id}`;
  const [asset] = await db.select().from(referenceAssets).where(eq(referenceAssets.id, assetId));
  if (!asset || asset.type !== 'tabular_workflow') {
    return res.status(404).json({ error: 'Workflow not found' });
  }
  res.json(assetToLegacy(asset));
});
