/**
 * ArchiCore OSS - REST API Server
 */

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { config } from 'dotenv';
import { ProjectManager } from './project-manager.js';
import { graphRoutes } from './routes/graph.js';
import { searchRoutes } from './routes/search.js';
import { analysisRoutes } from './routes/analysis.js';
import { projectRoutes } from './routes/projects.js';
import { exportRoutes } from './routes/export.js';
import { loadLLMPlugin } from '../plugins/index.js';
import { Logger } from '../utils/logger.js';

config();

const app = express();
const port = parseInt(process.env.PORT || '3000');

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Project Manager
const pm = new ProjectManager();

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Routes
app.use('/api/graph', graphRoutes(pm));
app.use('/api/search', searchRoutes(pm));
app.use('/api/analysis', analysisRoutes(pm));
app.use('/api/projects', projectRoutes(pm));
app.use('/api/export', exportRoutes(pm));

// Start server
async function start() {
  await pm.initialize();

  // Load LLM plugin if configured
  const plugin = await loadLLMPlugin();
  if (plugin) {
    pm.llmPlugin = plugin;
    Logger.info(`LLM plugin loaded: ${plugin.name}`);
  }

  app.listen(port, () => {
    Logger.success(`ArchiCore OSS API running on http://localhost:${port}`);
    Logger.info('Endpoints:');
    Logger.info('  POST /api/projects/index       - Index a project');
    Logger.info('  GET  /api/projects/status       - Project status');
    Logger.info('  GET  /api/graph/stats           - Graph statistics');
    Logger.info('  GET  /api/graph/dependencies/:f - File dependencies');
    Logger.info('  GET  /api/graph/dependents/:f   - File dependents');
    Logger.info('  GET  /api/graph/impact/:f       - Transitive impact');
    Logger.info('  GET  /api/graph/cycles          - Circular dependencies');
    Logger.info('  GET  /api/graph/hubs            - Hub files');
    Logger.info('  GET  /api/graph/orphans         - Orphan files');
    Logger.info('  GET  /api/search?q=...          - BM25 code search');
    Logger.info('  GET  /api/search/symbols?q=...  - Symbol search');
    Logger.info('  GET  /api/analysis/metrics      - Code metrics');
    Logger.info('  GET  /api/analysis/security     - Security issues');
    Logger.info('  GET  /api/analysis/dead-code    - Dead code');
    Logger.info('  GET  /api/analysis/duplication  - Code duplication');
    Logger.info('  GET  /api/analysis/rules        - Rule violations');
    Logger.info('  POST /api/analysis/impact       - Impact analysis');
    Logger.info('  GET  /api/export/:format        - Export report');
  });
}

start().catch(err => {
  Logger.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
