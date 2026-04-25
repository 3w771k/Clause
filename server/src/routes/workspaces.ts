import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { workspaces, documents } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const workspacesRouter = Router();

workspacesRouter.get('/', async (_req, res) => {
  const rows = await db.select().from(workspaces).orderBy(workspaces.createdAt);
  res.json(rows);
});

workspacesRouter.post('/', async (req, res) => {
  const { name, description } = req.body as { name: string; description?: string };
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = `ws_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  const [ws] = await db.insert(workspaces)
    .values({ id, name, description: description ?? null, createdBy: 'demo-user' })
    .returning();
  res.status(201).json(ws);
});

workspacesRouter.get('/:id', async (req, res) => {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, req.params.id));
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });
  res.json(ws);
});

workspacesRouter.put('/:id', async (req, res) => {
  const { name, description } = req.body as { name?: string; description?: string };
  const [updated] = await db.update(workspaces)
    .set({ ...(name && { name }), ...(description !== undefined && { description }) })
    .where(eq(workspaces.id, req.params.id))
    .returning();
  if (!updated) return res.status(404).json({ error: 'Workspace not found' });
  res.json(updated);
});

workspacesRouter.delete('/:id', async (req, res) => {
  await db.delete(workspaces).where(eq(workspaces.id, req.params.id));
  res.status(204).send();
});
