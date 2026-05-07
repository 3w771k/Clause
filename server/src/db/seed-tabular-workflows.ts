// Promotion des workflows OOTB JSON en ReferenceAssets de type 'tabular_workflow'.
// Idempotent : si un asset avec le même id existe déjà, ne fait rien.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { db, sqlite } from './index.js';
import { referenceAssets, referenceAssetVersions } from './schema.js';
import { eq } from 'drizzle-orm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = path.join(__dirname, '../workflows');

interface WorkflowJson {
  id: string;
  name: string;
  description: string;
  kind: string;
  applicableDocumentTypes: string[];
  language: string;
  definition: { columns: Array<{ label: string; question: string; expectedType: string }> };
}

export async function seedTabularWorkflows(opts: { force?: boolean } = {}) {
  if (!fs.existsSync(WORKFLOWS_DIR)) return [];
  const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json'));
  const seeded: string[] = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf-8')) as WorkflowJson;
      const assetId = `wf_${raw.id}`;

      const [existing] = await db.select().from(referenceAssets).where(eq(referenceAssets.id, assetId));
      if (existing && !opts.force) continue;

      const now = new Date().toISOString();
      const content = {
        schemaVersion: 1 as const,
        applicableDocumentTypes: raw.applicableDocumentTypes ?? [],
        columns: (raw.definition?.columns ?? []).map((c, i) => ({
          id: `col_${i}`,
          label: c.label,
          question: c.question,
          expectedType: (['text', 'number', 'date', 'boolean', 'enum'].includes(c.expectedType)
            ? c.expectedType : 'text') as 'text' | 'number' | 'date' | 'boolean' | 'enum',
          order: i,
        })),
      };

      if (existing && opts.force) {
        await db.update(referenceAssets).set({
          name: raw.name,
          description: raw.description ?? '',
          language: raw.language ?? 'fr',
          contentJson: JSON.stringify(content),
          governanceStatus: 'published',
          lastUpdatedAt: now,
        }).where(eq(referenceAssets.id, assetId));
      } else {
        await db.insert(referenceAssets).values({
          id: assetId,
          type: 'tabular_workflow',
          name: raw.name,
          description: raw.description ?? '',
          createdAt: now,
          createdBy: 'system',
          lastUpdatedAt: now,
          lastUpdatedBy: 'system',
          ontologyId: 'maison',
          jurisdiction: null,
          language: raw.language ?? 'fr',
          currentVersion: 1,
          governanceStatus: 'published',
          tags: '[]',
          contentJson: JSON.stringify(content),
        });
        await db.insert(referenceAssetVersions).values({
          id: `rav_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
          assetId,
          version: 1,
          createdAt: now,
          createdBy: 'system',
          summary: 'Seed initial OOTB',
          contentJson: JSON.stringify(content),
        });
      }
      seeded.push(assetId);
    } catch (err) {
      console.warn(`[seed-tabular-workflows] skip ${file}:`, err);
    }
  }
  return seeded;
}

// Run standalone : `tsx src/db/seed-tabular-workflows.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  seedTabularWorkflows({ force: true }).then(seeded => {
    console.log(`✅ Seeded ${seeded.length} tabular_workflow asset(s):`, seeded);
    sqlite.close();
  });
}
