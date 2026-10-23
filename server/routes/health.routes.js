import { Router } from 'express';

import { SERVICE_NAME } from '../config.js';

/**
 * GET /health: the process is running.
 * GET /ready: required configuration is usable. Secrets are never returned.
 *
 * @param {object} deps
 * @param {object} deps.config
 * @param {{ getAll: () => Promise<ReadonlyArray<object>> }} deps.templateRepository
 * @returns {import('express').Router}
 */
export function createHealthRouter({ config, templateRepository }) {
  const router = Router();

  router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: SERVICE_NAME });
  });

  router.get('/ready', async (req, res) => {
    const checks = {
      templateCatalog: false,
      publicBaseUrl: /^https:\/\//.test(config.publicBaseUrl) || !config.isProduction,
      jwtConfigured: !config.requireJwt || config.jwtSecret.length > 0,
      notificationHubConfigured: config.notificationHub.mode === 'http' || !config.isProduction,
    };
    try {
      const templates = await templateRepository.getAll();
      checks.templateCatalog = templates.length > 0;
    } catch {
      checks.templateCatalog = false;
    }

    const ready = Object.values(checks).every(Boolean);
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not-ready',
      mode: config.env,
      checks,
    });
  });

  return router;
}
