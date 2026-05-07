import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const workflowsRouter = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = path.join(__dirname, '../workflows');

interface WorkflowColumn {
  label: string;
  question: string;
  expectedType: string;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  kind: string;
  applicableDocumentTypes: string[];
  language: string;
  definition: {
    columns: WorkflowColumn[];
  };
}

function loadWorkflows(): Workflow[] {
  if (!fs.existsSync(WORKFLOWS_DIR)) return [];
  return fs.readdirSync(WORKFLOWS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf-8')) as Workflow;
      } catch {
        return null;
      }
    })
    .filter((w): w is Workflow => w !== null);
}

// Cache at boot — workflows are read-only
const workflows = loadWorkflows();

workflowsRouter.get('/', (_req, res) => {
  res.json(workflows);
});

workflowsRouter.get('/:id', (req, res) => {
  const wf = workflows.find(w => w.id === req.params.id);
  if (!wf) return res.status(404).json({ error: 'Workflow not found' });
  res.json(wf);
});
