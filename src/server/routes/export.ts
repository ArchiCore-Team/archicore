/**
 * Export Routes - /api/export/:format
 */

import { Router, type Request, type Response } from 'express';
import type { ProjectManager } from '../project-manager.js';

export function exportRoutes(pm: ProjectManager): Router {
  const router = Router();

  router.get('/:format', async (req: Request, res: Response): Promise<void> => {
    const format = req.params.format as 'json' | 'html' | 'markdown' | 'csv' | 'graphml';
    const validFormats = ['json', 'html', 'markdown', 'csv', 'graphml'];

    if (!validFormats.includes(format)) {
      res.status(400).json({
        error: `Invalid format "${format}". Valid formats: ${validFormats.join(', ')}`,
      });
      return;
    }

    try {
      const result = await pm.exportAs(format);

      const contentTypes: Record<string, string> = {
        json: 'application/json',
        html: 'text/html',
        markdown: 'text/markdown',
        csv: 'text/csv',
        graphml: 'application/xml',
      };

      res.setHeader('Content-Type', contentTypes[format] || 'text/plain');

      if (req.query.download === 'true') {
        const ext = format === 'markdown' ? 'md' : format;
        res.setHeader('Content-Disposition', `attachment; filename="archicore-report.${ext}"`);
      }

      res.send(result);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
