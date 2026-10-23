import { Router } from 'express';

import { buildActivityConfig } from '../services/activity-config-builder.js';

/**
 * GET /config.json: the activity definition Journey Builder reads.
 * Public by design; it contains no secrets.
 *
 * @param {{ config: object }} deps
 * @returns {import('express').Router}
 */
export function createConfigRouter({ config }) {
  const router = Router();
  const definition = buildActivityConfig({ publicBaseUrl: config.publicBaseUrl, requireJwt: config.requireJwt });

  router.get('/config.json', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json(definition);
  });

  return router;
}
