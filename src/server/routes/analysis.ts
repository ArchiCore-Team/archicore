/**
 * Analysis Routes - /api/analysis/*
 */

import { Router, type Request, type Response } from 'express';
import type { ProjectManager } from '../project-manager.js';

export function analysisRoutes(pm: ProjectManager): Router {
  const router = Router();

  router.get('/metrics', async (_req: Request, res: Response): Promise<void> => {
    try {
      const metrics = await pm.getMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get('/security', async (_req: Request, res: Response): Promise<void> => {
    try {
      const issues = await pm.getSecurityIssues();
      res.json(issues);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get('/dead-code', async (_req: Request, res: Response): Promise<void> => {
    try {
      const deadCode = await pm.getDeadCode();
      res.json(deadCode);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get('/duplication', async (_req: Request, res: Response): Promise<void> => {
    try {
      const duplication = await pm.getDuplication();
      res.json(duplication);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get('/rules', async (_req: Request, res: Response): Promise<void> => {
    try {
      const violations = await pm.checkRules();
      res.json(violations);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get('/narrator', async (_req: Request, res: Response): Promise<void> => {
    try {
      const report = await pm.getNarratorReport();
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post('/impact', async (req: Request, res: Response): Promise<void> => {
    try {
      const change = req.body;
      if (!change || !change.files) {
        res.status(400).json({ error: 'Request body must include "files" array' });
        return;
      }
      const impact = await pm.getImpact(change);
      const result: Record<string, unknown> = { ...impact };

      // LLM explanation if plugin available
      if (pm.llmPlugin) {
        try {
          result.explain = await pm.llmPlugin.explainImpact(impact);
        } catch {
          // LLM explanation is optional
        }
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
