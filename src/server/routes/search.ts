/**
 * Search Routes - /api/search
 */

import { Router, type Request, type Response } from 'express';
import type { ProjectManager } from '../project-manager.js';

export function searchRoutes(pm: ProjectManager): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response): void => {
    const q = req.query.q as string;
    if (!q) { res.status(400).json({ error: 'Query parameter "q" is required' }); return; }
    const limit = parseInt(req.query.limit as string) || 20;
    const results = pm.searchCode(q, limit);
    res.json(results);
  });

  router.get('/symbols', (req: Request, res: Response): void => {
    const q = req.query.q as string;
    if (!q) { res.status(400).json({ error: 'Query parameter "q" is required' }); return; }
    const limit = parseInt(req.query.limit as string) || 20;
    const results = pm.searchSymbols(q, limit);
    res.json(results);
  });

  return router;
}
