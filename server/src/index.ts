import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db/index.js';
import { workspacesRouter } from './routes/workspaces.js';
import { documentsRouter } from './routes/documents.js';
import { analysesRouter } from './routes/analyses.js';
import { legalObjectsRouter } from './routes/legal-objects.js';
import { deliverablesRouter } from './routes/deliverables.js';
import { referenceBaseRouter } from './routes/reference-base.js';
import { exportRouter } from './routes/export.js';
import { tcdRouter } from './routes/tcd.js';
import { clausesRouter } from './routes/clauses.js';
import { intentRouter } from './routes/intent.js';
import { preloadEmbeddings } from './embeddings/embedding.service.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const FRONT_URL = process.env.FRONT_URL ?? 'http://localhost:4200';

app.use(cors({ origin: FRONT_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// ─── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ─── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/workspaces', workspacesRouter);
app.use('/api/workspaces/:wsId/documents', documentsRouter);
app.use('/api/workspaces/:wsId/analyses', analysesRouter);
app.use('/api/legal-objects', legalObjectsRouter);
app.use('/api/deliverables', deliverablesRouter);
app.use('/api/reference-base', referenceBaseRouter);
app.use('/api/deliverables', exportRouter);
app.use('/api/clauses', clausesRouter);
app.use('/api/intent', intentRouter);
app.use('/api', tcdRouter);

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
initDb();
preloadEmbeddings().catch((err) => console.error('[embeddings] preload failed:', err));
app.listen(PORT, () => {
  console.log(`Clause-server listening on http://localhost:${PORT}`);
  console.log(`  CORS: ${FRONT_URL}`);
  console.log(`  LLM:  ${process.env.USE_MOCK_LLM === 'false' ? 'Anthropic' : 'Mock'}`);
});
