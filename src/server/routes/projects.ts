/**
 * Project Routes - /api/projects/*
 */

import { Router, type Request, type Response } from 'express';
import type { ProjectManager } from '../project-manager.js';

export function projectRoutes(pm: ProjectManager): Router {
  const router = Router();

  router.post('/index', async (req: Request, res: Response): Promise<void> => {
    const { rootDir } = req.body;
    if (!rootDir) {
      res.status(400).json({ error: '"rootDir" is required' });
      return;
    }

    try {
      const messages: string[] = [];
      await pm.indexProject(rootDir, (msg) => messages.push(msg));
      res.json({ status: 'ok', messages });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get('/status', (_req: Request, res: Response): void => {
    res.json(pm.getStatus());
  });

  router.get('/stats', (_req: Request, res: Response): void => {
    res.json(pm.getStats());
  });

  return router;
}
