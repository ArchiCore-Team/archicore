/**
 * Graph Routes - /api/graph/*
 */

import { Router, type Request, type Response } from 'express';
import type { ProjectManager } from '../project-manager.js';

export function graphRoutes(pm: ProjectManager): Router {
  const router = Router();

  router.get('/dependencies/:file(*)', async (req: Request, res: Response): Promise<void> => {
    const queries = pm.getGraphQueries();
    if (!queries) { res.status(503).json({ error: 'Graph not initialized' }); return; }
    const results = await queries.dependenciesOf(req.params.file as string);
    res.json(results);
  });

  router.get('/dependents/:file(*)', async (req: Request, res: Response): Promise<void> => {
    const queries = pm.getGraphQueries();
    if (!queries) { res.status(503).json({ error: 'Graph not initialized' }); return; }
    const results = await queries.dependentsOf(req.params.file as string);
    res.json(results);
  });

  router.get('/impact/:file(*)', async (req: Request, res: Response): Promise<void> => {
    const queries = pm.getGraphQueries();
    if (!queries) { res.status(503).json({ error: 'Graph not initialized' }); return; }
    const maxDepth = parseInt(req.query.maxDepth as string) || 5;
    const results = await queries.impactOf(req.params.file as string, maxDepth);
    res.json(results);
  });

  router.get('/cycles', async (_req: Request, res: Response): Promise<void> => {
    const queries = pm.getGraphQueries();
    if (!queries) { res.status(503).json({ error: 'Graph not initialized' }); return; }
    const results = await queries.findCycles();
    res.json(results);
  });

  router.get('/hubs', async (req: Request, res: Response): Promise<void> => {
    const queries = pm.getGraphQueries();
    if (!queries) { res.status(503).json({ error: 'Graph not initialized' }); return; }
    const limit = parseInt(req.query.limit as string) || 10;
    const results = await queries.hubFiles(limit);
    res.json(results);
  });

  router.get('/orphans', async (_req: Request, res: Response): Promise<void> => {
    const queries = pm.getGraphQueries();
    if (!queries) { res.status(503).json({ error: 'Graph not initialized' }); return; }
    const results = await queries.orphanFiles();
    res.json(results);
  });

  router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
    const queries = pm.getGraphQueries();
    if (!queries) { res.status(503).json({ error: 'Graph not initialized' }); return; }
    const stats = await queries.stats();
    res.json(stats);
  });

  return router;
}
